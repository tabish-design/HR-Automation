/**
 * ID Card Renderer Module for Truva HR Automation Master Suite
 */
(function (window) {
  'use strict';

  const IdCardRenderer = {
    assets: {
      background: null,
      logo: null,
      loaded: false
    },

    init: function () {
      const bgSrc = (window.HR_ASSETS && window.HR_ASSETS.background_template) ? window.HR_ASSETS.background_template : 'assets/background_template.png';
      const logoSrc = (window.HR_ASSETS && window.HR_ASSETS.truva_logo) ? window.HR_ASSETS.truva_logo : 'assets/truva_logo.png';

      const p1 = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { IdCardRenderer.assets.background = img; resolve(); };
        img.onerror = () => { console.warn('Could not load background template'); resolve(); };
        img.src = bgSrc;
      });

      const p2 = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { IdCardRenderer.assets.logo = img; resolve(); };
        img.onerror = () => { console.warn('Could not load truva logo'); resolve(); };
        img.src = logoSrc;
      });

      return Promise.all([p1, p2]).then(() => {
        IdCardRenderer.assets.loaded = true;
      });
    },

    /**
     * Draws the ID Card onto a targeted 2D canvas
     */
    draw: function (canvas, masterState, cardState) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // 1. Background Template
      if (IdCardRenderer.assets.background && IdCardRenderer.assets.background.complete) {
        ctx.drawImage(IdCardRenderer.assets.background, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#ff6020';
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Employee Photo
      const portraitImg = masterState.maskedCanvas || masterState.photoImage;
      if (portraitImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 45;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 15;

        const gray = cardState.grayscale ? 'grayscale(100%)' : 'grayscale(0%)';
        const bright = cardState.photoBrightness !== undefined ? cardState.photoBrightness : 100;
        const contrast = cardState.photoContrast !== undefined ? cardState.photoContrast : 100;
        ctx.filter = `${gray} brightness(${bright}%) contrast(${contrast}%)`;

        const px = (344 + (cardState.photoX || 0)) * (w / 687);
        const py = (512 + (cardState.photoY || 0)) * (h / 1024);
        ctx.translate(px, py);
        ctx.rotate(((cardState.photoRotate || 0) * Math.PI) / 180);

        const imgRatio = portraitImg.width / portraitImg.height;
        const baseH = h;
        const baseW = baseH * imgRatio;
        const scale = cardState.photoScale || 1.0;
        const drawW = baseW * scale;
        const drawH = baseH * scale;

        ctx.drawImage(portraitImg, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      // 3. Bottom Gradient for text legibility
      ctx.save();
      const grad = ctx.createLinearGradient(0, h * (750 / 1024), 0, h);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * (750 / 1024), w, h * (274 / 1024));

      // 4. Employee Name & Title (Only draw if non-empty)
      const empName = cardState.overrideText ? (cardState.name || '') : (masterState.fullName || '');
      const empTitle = cardState.overrideText ? (cardState.title || '') : (masterState.department || '');

      const scaleF = w / 687;
      const textX = (cardState.nameX || 52) * scaleF;
      const nameY = (cardState.nameY || 860) * (h / 1024);
      const titleY = (cardState.titleY || 915) * (h / 1024);

      if (empName) {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        let nameSize = Math.round(56 * scaleF);
        ctx.font = `800 ${nameSize}px "Outfit", sans-serif`;
        let nameW = ctx.measureText(empName).width;
        const maxW = 430 * scaleF;

        while (nameW > maxW && nameSize > 20 * scaleF) {
          nameSize -= 2;
          ctx.font = `800 ${nameSize}px "Outfit", sans-serif`;
          nameW = ctx.measureText(empName).width;
        }

        ctx.fillText(empName, textX, nameY);
      }

      if (empTitle) {
        ctx.font = `400 ${Math.round(30 * scaleF)}px "Montserrat", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillText(empTitle, textX, titleY);
      }
      ctx.restore();

      // 5. Brand Logo (Bottom Right)
      const logoCenter = { x: 600 * scaleF, y: 890 * (h / 1024), radius: 48 * scaleF };

      ctx.save();
      ctx.beginPath();
      ctx.arc(logoCenter.x, logoCenter.y, logoCenter.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 5;
      ctx.fill();
      ctx.restore();

      if (cardState.logoType === 'custom' && cardState.customLogoImage) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoCenter.x, logoCenter.y, logoCenter.radius - 4, 0, Math.PI * 2);
        ctx.clip();

        const lImg = cardState.customLogoImage;
        const lAspect = lImg.width / lImg.height;
        const targetD = (logoCenter.radius - 4) * 2;
        let lw = targetD;
        let lh = targetD;
        if (lAspect >= 1) {
          lh = targetD / lAspect;
        } else {
          lw = targetD * lAspect;
        }
        ctx.drawImage(lImg, logoCenter.x - lw / 2, logoCenter.y - lh / 2, lw, lh);
        ctx.restore();
      } else if (IdCardRenderer.assets.logo && IdCardRenderer.assets.logo.complete) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoCenter.x, logoCenter.y, logoCenter.radius - 1, 0, Math.PI * 2);
        ctx.clip();
        const logoSize = logoCenter.radius * 2;
        ctx.drawImage(IdCardRenderer.assets.logo, logoCenter.x - logoSize / 2, logoCenter.y - logoSize / 2, logoSize, logoSize);
        ctx.restore();
      }
    },

    getExportCanvas: function (masterState, cardState, scaleMultiplier = 2) {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 687 * scaleMultiplier;
      exportCanvas.height = 1024 * scaleMultiplier;
      IdCardRenderer.draw(exportCanvas, masterState, cardState);
      return exportCanvas;
    }
  };

  window.IdCardRenderer = IdCardRenderer;
})(window);
