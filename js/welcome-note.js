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

      const imgPromise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { WelcomeNoteRenderer.assets.baseTemplate = img; WelcomeNoteRenderer.assets.loaded = true; resolve(); };
        img.onerror = () => { console.warn('Could not load base template'); WelcomeNoteRenderer.assets.loaded = true; resolve(); };
        img.src = baseSrc;
      });

      const fontPromise = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

      return Promise.all([imgPromise, fontPromise]).then(() => {
        WelcomeNoteRenderer.assets.loaded = true;
      });
    },

    parseBubbleLines: function (text) {
      if (!text) return [];
      const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const items = [];

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line.includes(' - ')) {
          const idx = line.indexOf(' - ');
          items.push({
            question: line.slice(0, idx).trim(),
            answer: line.slice(idx + 3).trim()
          });
        } else if (line.startsWith('-') || line.startsWith('–') || line.startsWith('—')) {
          const ansText = line.replace(/^[-–—]\s*/, '').trim();
          if (items.length > 0 && !items[items.length - 1].answer) {
            items[items.length - 1].answer = ansText;
          } else {
            items.push({ question: '', answer: ansText });
          }
        } else if (i + 1 < rawLines.length && (rawLines[i + 1].startsWith('-') || rawLines[i + 1].startsWith('–') || rawLines[i + 1].startsWith('—'))) {
          const qText = line;
          const aText = rawLines[i + 1].replace(/^[-–—]\s*/, '').trim();
          items.push({ question: qText, answer: aText });
          i++; // skip next line
        } else {
          items.push({ question: line, answer: '' });
        }
      }
      return items;
    },

    draw: function (canvas, masterState, noteState) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // 1. Base Template Plate
      if (WelcomeNoteRenderer.assets.baseTemplate && WelcomeNoteRenderer.assets.baseTemplate.complete) {
        ctx.drawImage(WelcomeNoteRenderer.assets.baseTemplate, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Employee Portrait Photo
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

        const aspect = (photoImg.naturalHeight || photoImg.height) / (photoImg.naturalWidth || photoImg.width || 1);
        const pw = pScale;
        const ph = pScale * aspect;

        ctx.drawImage(photoImg, -pw / 2, -ph / 2, pw, ph);
        ctx.restore();
      }

      // 3. Speech Bubble Content (With Accurate Multiline Word-Wrapping)
      const bubbleText = noteState.overrideText ? (noteState.bubbleText || '') : (masterState.bubbleText || '');
      const items = WelcomeNoteRenderer.parseBubbleLines(bubbleText);

      if (items.length > 0) {
        ctx.save();
        const bx = (noteState.bubbleX / 100) * w;
        const by = (noteState.bubbleY / 100) * h;
        const bScale = (noteState.bubbleScale / 100) * w;

        ctx.translate(bx, by);
        ctx.rotate(((noteState.bubbleRotate || 0) * Math.PI) / 180);

        const fontSize = Math.max(11, bScale * 0.053);
        const lineSpacing = fontSize * 1.32;
        const itemGap = bScale * 0.028;
        const maxLineWidth = bScale;

        ctx.font = `600 ${fontSize}px "Kalam", cursive, sans-serif`;
        ctx.textBaseline = 'top';

        // Pre-process items into wrapped visual lines
        const renderedItems = [];
        items.forEach(item => {
          const qWords = (item.question || '').split(' ').filter(Boolean).map(w => ({ text: w, color: '#1a1a1a' }));
          const aWords = (item.answer || '').split(' ').filter(Boolean).map(w => ({ text: w, color: '#ee6c2d' }));
          const allWords = [...qWords, ...aWords];

          const itemLines = [];
          let currentLine = [];
          let currentWidth = 0;

          allWords.forEach(wObj => {
            const wMeasure = ctx.measureText(wObj.text + ' ').width;
            if (currentLine.length > 0 && currentWidth + wMeasure > maxLineWidth) {
              itemLines.push(currentLine);
              currentLine = [wObj];
              currentWidth = wMeasure;
            } else {
              currentLine.push(wObj);
              currentWidth += wMeasure;
            }
          });

          if (currentLine.length > 0) {
            itemLines.push(currentLine);
          }
          renderedItems.push(itemLines);
        });

        // Compute total block height to vertically center in bubble
        let totalBlockHeight = 0;
        renderedItems.forEach((lines, idx) => {
          totalBlockHeight += lines.length * lineSpacing;
          if (idx < renderedItems.length - 1) totalBlockHeight += itemGap;
        });

        let curY = -totalBlockHeight / 2;
        const startX = -bScale / 2;

        renderedItems.forEach((lines, idx) => {
          lines.forEach(lineWords => {
            let curX = startX;
            lineWords.forEach(wObj => {
              ctx.fillStyle = wObj.color;
              ctx.fillText(wObj.text, curX, curY);
              curX += ctx.measureText(wObj.text + ' ').width;
            });
            curY += lineSpacing;
          });
          if (idx < renderedItems.length - 1) {
            curY += itemGap;
          }
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

        const nameFontSize = Math.max(14, nScale * 0.16);
        const deptFontSize = Math.max(10, nScale * 0.096);
        const marginGap = nScale * 0.018;

        const totalNameH = nameFontSize + marginGap + deptFontSize;
        const startY = -totalNameH / 2;
        const startX = -nScale / 2;

        if (empFirstName) {
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = `800 ${nameFontSize}px "Outfit", "Poppins", sans-serif`;
          ctx.fillText(empFirstName, startX, startY);
        }

        if (empDept) {
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = `700 ${deptFontSize}px "Kalam", cursive, sans-serif`;
          ctx.fillText(empDept, startX, startY + nameFontSize + marginGap);
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
