/**
 * Visiting Card Renderer Module for Truva HR Automation Master Suite
 */
(function (window) {
  'use strict';

  const VisitingCardRenderer = {
    assets: {
      frontImage: null,
      logoImage: null,
      loaded: false
    },
    qrCodeElement: null,
    qrCanvas: null,
    BRAND_ORANGE: '#ff6f38',

    init: function () {
      const frontSrc = (window.HR_ASSETS && window.HR_ASSETS.front) ? window.HR_ASSETS.front : 'assets/front.png';
      const logoSrc = (window.HR_ASSETS && window.HR_ASSETS.logo) ? window.HR_ASSETS.logo : 'assets/logo.png';

      const p1 = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { VisitingCardRenderer.assets.frontImage = img; resolve(); };
        img.onerror = () => { console.warn('Could not load visiting card front image'); resolve(); };
        img.src = frontSrc;
      });

      const p2 = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { VisitingCardRenderer.assets.logoImage = img; resolve(); };
        img.onerror = () => { console.warn('Could not load visiting card logo'); resolve(); };
        img.src = logoSrc;
      });

      return Promise.all([p1, p2]).then(() => {
        VisitingCardRenderer.assets.loaded = true;
      });
    },

    /**
     * Updates/Generates dynamic QR Code using QRCode.js
     */
    updateQRCode: function (targetUrl, callback) {
      const url = (targetUrl && targetUrl.trim()) ? targetUrl.trim() : 'https://truva.in';
      if (!VisitingCardRenderer.qrCodeElement) {
        VisitingCardRenderer.qrCodeElement = document.createElement('div');
        VisitingCardRenderer.qrCodeElement.style.display = 'none';
        document.body.appendChild(VisitingCardRenderer.qrCodeElement);
      }

      VisitingCardRenderer.qrCodeElement.innerHTML = '';

      if (window.QRCode) {
        new window.QRCode(VisitingCardRenderer.qrCodeElement, {
          text: url,
          width: 512,
          height: 512,
          colorDark: '#ffffff',
          colorLight: VisitingCardRenderer.BRAND_ORANGE,
          correctLevel: window.QRCode.CorrectLevel.M
        });

        setTimeout(() => {
          VisitingCardRenderer.qrCanvas = VisitingCardRenderer.qrCodeElement.querySelector('canvas');
          if (callback) callback();
        }, 80);
      } else {
        if (callback) callback();
      }
    },

    /**
     * Draws the Front of the Visiting Card
     */
    drawFront: function (canvas) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      if (VisitingCardRenderer.assets.frontImage && VisitingCardRenderer.assets.frontImage.complete) {
        ctx.drawImage(VisitingCardRenderer.assets.frontImage, 0, 0, w, h);
      } else {
        ctx.fillStyle = VisitingCardRenderer.BRAND_ORANGE;
        ctx.fillRect(0, 0, w, h);
        if (VisitingCardRenderer.assets.logoImage && VisitingCardRenderer.assets.logoImage.complete) {
          const lSize = Math.min(w, h) * 0.35;
          ctx.drawImage(VisitingCardRenderer.assets.logoImage, (w - lSize) / 2, (h - lSize) / 2, lSize, lSize);
        }
      }
    },

    /**
     * Draws the Back of the Visiting Card
     * @param {HTMLCanvasElement} canvas Target Canvas (2400 x 4200 or preview scale)
     * @param {Object} masterState 
     * @param {Object} cardState 
     */
    drawBack: function (canvas, masterState, cardState) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const sf = w / 2400; // Scale factor relative to 2400x4200 base

      ctx.clearRect(0, 0, w, h);

      // 1. Solid Truva Orange Background
      ctx.fillStyle = VisitingCardRenderer.BRAND_ORANGE;
      ctx.fillRect(0, 0, w, h);

      const padX = 224 * sf;
      const nameVal = cardState.overrideText ? (cardState.name || '') : (masterState.fullName || '');
      const deptVal = (cardState.overrideText ? (cardState.dept || '') : (masterState.department || '')).toUpperCase();
      const emailVal = cardState.overrideText ? (cardState.email || '') : (masterState.email || '');
      const phoneVal = cardState.overrideText ? (cardState.phone || '') : (masterState.phone || '');
      
      // CTA Text with default fallback
      const cta1Val = cardState.overrideText ? (cardState.cta1 || '') : (masterState.cta1 || 'Learn more at');
      const cta2Val = cardState.overrideText ? (cardState.cta2 || '') : (masterState.cta2 || 'Truva.in');
      const isStacked = cardState.stackContact !== undefined ? cardState.stackContact : masterState.stackContact;

      // 2. Full Name
      if (nameVal) {
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `400 ${Math.round(240 * sf)}px "Poppins", sans-serif`;
        ctx.fillText(nameVal, padX, (300 + (cardState.nameYOffset || 0)) * sf);
      }

      // 3. Department
      if (deptVal) {
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `400 ${Math.round(125 * sf)}px "Poppins", sans-serif`;
        ctx.fillText(deptVal, padX, (580 + (cardState.deptYOffset || 0)) * sf);
      }

      // 4. Contact Details (Email and Phone)
      ctx.font = `500 ${Math.round(110 * sf)}px "Poppins", sans-serif`;
      const contactY = (960 + (cardState.contactYOffset || 0)) * sf;

      if (isStacked) {
        ctx.textAlign = 'left';
        if (emailVal) ctx.fillText(emailVal, padX, contactY);
        if (phoneVal) ctx.fillText(phoneVal, padX, contactY + 170 * sf);
      } else {
        ctx.textAlign = 'left';
        if (emailVal) ctx.fillText(emailVal, padX, contactY);
        ctx.textAlign = 'right';
        if (phoneVal) ctx.fillText(phoneVal, w - padX, contactY);
        ctx.textAlign = 'left';
      }

      // 5. QR Code (Bottom Left)
      const qrSize = 676 * sf;
      const qrY = h - (300 * sf) - qrSize + ((cardState.qrYOffset || 0) * sf);

      if (VisitingCardRenderer.qrCanvas) {
        ctx.drawImage(VisitingCardRenderer.qrCanvas, padX, qrY, qrSize, qrSize);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(padX, qrY, qrSize, qrSize);
      }

      // 6. Website CTA Text (Directly to the right of the QR code)
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const ctaX = padX + qrSize + (100 * sf);

      if (cta1Val) {
        ctx.font = `400 ${Math.round(100 * sf)}px "Poppins", sans-serif`;
        ctx.fillText(cta1Val, ctaX, qrY + (200 * sf));
      }

      if (cta2Val) {
        ctx.font = `600 ${Math.round(140 * sf)}px "Poppins", sans-serif`;
        ctx.fillText(cta2Val, ctaX, qrY + (360 * sf));
      }
    },

    getExportCanvases: function (masterState, cardState) {
      const front = document.createElement('canvas');
      front.width = 2400;
      front.height = 4200;
      VisitingCardRenderer.drawFront(front);

      const back = document.createElement('canvas');
      back.width = 2400;
      back.height = 4200;
      VisitingCardRenderer.drawBack(back, masterState, cardState);

      return { front, back };
    },

    generatePDF: function (masterState, cardState, callback) {
      const { front, back } = VisitingCardRenderer.getExportCanvases(masterState, cardState);
      const jsPdfClass = window.jspdf ? (window.jspdf.jsPDF || window.jspdf) : window.jsPDF;

      if (!jsPdfClass) {
        console.error('jsPDF not loaded');
        if (callback) callback(null, null);
        return;
      }

      try {
        const cardW = 50.8; // 2 inches in mm
        const cardH = 88.9; // 3.5 inches in mm

        const pdf = new jsPdfClass({
          orientation: 'portrait',
          unit: 'mm',
          format: [cardW, cardH]
        });

        const frontUrl = front.toDataURL('image/jpeg', 0.95);
        pdf.addImage(frontUrl, 'JPEG', 0, 0, cardW, cardH);

        pdf.addPage([cardW, cardH], 'portrait');
        const backUrl = back.toDataURL('image/jpeg', 0.95);
        pdf.addImage(backUrl, 'JPEG', 0, 0, cardW, cardH);

        const empName = (masterState.fullName || 'Visiting_Card').trim().replace(/\s+/g, '_');
        const filename = `${empName}_Visiting_Card.pdf`;

        if (callback) {
          callback(pdf, filename);
        } else {
          pdf.save(filename);
        }
      } catch (err) {
        console.error('Failed to generate PDF:', err);
      }
    }
  };

  window.VisitingCardRenderer = VisitingCardRenderer;
})(window);
