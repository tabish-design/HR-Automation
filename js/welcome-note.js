/**
 * Welcome Note Studio (TruVibe Check) Renderer Module for Truva HR Automation Master Suite
 */
(function (window) {
  'use strict';

  const WelcomeNoteRenderer = {
    assets: {
      baseTemplate: null,
      loaded: false
    },

    DEFAULT_BUBBLE: '',

    init: function () {
      const baseSrc = (window.HR_ASSETS && window.HR_ASSETS.truvibe_base) ? window.HR_ASSETS.truvibe_base : 'assets/truvibe-base.png';

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { WelcomeNoteRenderer.assets.baseTemplate = img; WelcomeNoteRenderer.assets.loaded = true; resolve(); };
        img.onerror = () => { console.warn('Could not load base template'); WelcomeNoteRenderer.assets.loaded = true; resolve(); };
        img.src = baseSrc;
      });
    },

    parseBubbleLines: function (text) {
      if (!text) return [];
      return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const idx = line.indexOf(' - ');
        if (idx === -1) {
          return { question: line, answer: '' };
        }
        return {
          question: line.slice(0, idx + 1),
          answer: line.slice(idx + 3)
        };
      });
    },

    draw: function (canvas, masterState, noteState) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // 1. Base Template
      if (WelcomeNoteRenderer.assets.baseTemplate && WelcomeNoteRenderer.assets.baseTemplate.complete) {
        ctx.drawImage(WelcomeNoteRenderer.assets.baseTemplate, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Employee Photo
      const photoImg = masterState.maskedCanvas || masterState.photoImage;
      if (photoImg) {
        ctx.save();
        const px = (noteState.photoX / 100) * w;
        const py = (noteState.photoY / 100) * h;
        const pScale = (noteState.photoScale / 100) * w;

        ctx.translate(px, py);
        ctx.rotate(((noteState.photoRotate || 0) * Math.PI) / 180);

        if (noteState.photoTilt) {
          const tiltRad = (noteState.photoTilt * Math.PI) / 180;
          ctx.transform(1, 0, Math.tan(tiltRad), 1, 0, 0);
        }

        const aspect = photoImg.height / photoImg.width;
        const pw = pScale;
        const ph = pScale * aspect;

        ctx.drawImage(photoImg, -pw / 2, -ph / 2, pw, ph);
        ctx.restore();
      }

      // 3. Speech Bubble Content
      const bubbleText = noteState.overrideText ? (noteState.bubbleText || '') : (masterState.bubbleText || '');
      const lines = WelcomeNoteRenderer.parseBubbleLines(bubbleText);

      if (lines.length > 0) {
        ctx.save();
        const bx = (noteState.bubbleX / 100) * w;
        const by = (noteState.bubbleY / 100) * h;
        const bScale = (noteState.bubbleScale / 100) * w;

        ctx.translate(bx, by);
        ctx.rotate(((noteState.bubbleRotate || 0) * Math.PI) / 180);

        const fontSize = Math.max(10, Math.round(bScale * 0.053));
        const lineSpacing = Math.round(fontSize * 1.35);
        const itemGap = Math.round(bScale * 0.028);

        ctx.font = `600 ${fontSize}px "Kalam", cursive, sans-serif`;
        ctx.textBaseline = 'top';

        let currentY = -((lines.length * (lineSpacing + itemGap)) / 2);
        const startX = -bScale / 2;

        lines.forEach(item => {
          let textX = startX;

          ctx.fillStyle = '#1a1a1a';
          ctx.fillText(item.question, textX, currentY);
          const qWidth = ctx.measureText(item.question + ' ').width;

          if (item.answer) {
            ctx.fillStyle = '#ee6c2d';
            ctx.fillText(item.answer, textX + qWidth, currentY);
          }

          currentY += lineSpacing + itemGap;
        });

        ctx.restore();
      }

      // 4. Employee Name & Department Block
      const empFirstName = noteState.overrideText ? (noteState.firstName || '') : (masterState.firstName || (masterState.fullName ? masterState.fullName.split(' ')[0] : ''));
      const empDept = noteState.overrideText ? (noteState.department || '') : (masterState.department || '');

      if (empFirstName || empDept) {
        ctx.save();
        const nx = (noteState.nameX / 100) * w;
        const ny = (noteState.nameY / 100) * h;
        const nScale = (noteState.nameScale / 100) * w;

        ctx.translate(nx, ny);
        ctx.rotate(((noteState.nameRotate || 0) * Math.PI) / 180);

        const nameFontSize = Math.max(14, Math.round(nScale * 0.16));
        const deptFontSize = Math.max(10, Math.round(nScale * 0.096));

        if (empFirstName) {
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = `800 ${nameFontSize}px "Outfit", "Poppins", sans-serif`;
          ctx.fillText(empFirstName, -nScale / 2, -nameFontSize);
        }

        if (empDept) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `700 ${deptFontSize}px "Kalam", cursive, sans-serif`;
          ctx.fillText(empDept, -nScale / 2, -nameFontSize + nameFontSize * 1.15);
        }

        ctx.restore();
      }
    },

    getExportCanvas: function (masterState, noteState, scaleMultiplier = 3) {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 595 * scaleMultiplier;
      exportCanvas.height = 842 * scaleMultiplier;
      WelcomeNoteRenderer.draw(exportCanvas, masterState, noteState);
      return exportCanvas;
    }
  };

  window.WelcomeNoteRenderer = WelcomeNoteRenderer;
})(window);
