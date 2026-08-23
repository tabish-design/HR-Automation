/**
 * Truva HR Automation Master Suite - Main Application Controller
 */
(function () {
  'use strict';

  // --- Global Application State ---
  const state = {
    activeView: 'overview', // 'overview' | 'idcard' | 'visiting' | 'welcome'
    activeSidebarTab: 'profile', // 'profile' | 'photo' | 'asset'

    // 1. Master Single-Entry Profile
    master: {
      fullName: '',
      firstName: '',
      department: '',
      email: '',
      phone: '',
      qrUrl: 'https://truva.in',
      cta1: 'Learn more at',
      cta2: 'Truva.in',
      bubbleText: '',
      photoFile: null,
      photoImage: null,
      photoDataUrl: null,
      maskedCanvas: null,
      bgEngine: 'studio-ai',
      removebgApiKey: 'bes5RSxRG2cJptvTHcaoCfQC',
      maskThreshold: 0.5,
      maskFeather: 2.5,
      stackContact: false
    },

    // 2. ID Card Specific Adjustments
    idCard: {
      overrideText: false,
      name: '',
      title: '',
      photoScale: 1.0,
      photoX: 0,
      photoY: 0,
      photoRotate: 0,
      photoBrightness: 100,
      photoContrast: 100,
      grayscale: true,
      logoType: 'truva',
      customLogoImage: null,
      nameX: 52,
      nameY: 860,
      titleX: 52,
      titleY: 915,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0
    },

    // 3. Visiting Card Specific Adjustments
    visitingCard: {
      overrideText: false,
      name: '',
      dept: '',
      email: '',
      phone: '',
      qrUrl: '',
      cta1: '',
      cta2: '',
      stackContact: false,
      nameYOffset: 0,
      deptYOffset: 0,
      contactYOffset: 0,
      qrYOffset: 0
    },

    // 4. Welcome Note Poster Specific Adjustments
    welcomeNote: {
      overrideText: false,
      firstName: '',
      department: '',
      bubbleText: '',
      photoScale: 62,
      photoX: 62,
      photoY: 66,
      photoRotate: 0,
      photoTilt: 0,
      bubbleScale: 58,
      bubbleX: 41,
      bubbleY: 35,
      bubbleRotate: 0,
      nameScale: 55,
      nameX: 32,
      nameY: 90,
      nameRotate: 0,
      selectedTarget: null
    }
  };

  // --- Background Removal Engines ---
  let imglyRemoveBackground = null;
  let isImglyLoading = false;
  let selfieSegmenter = null;
  let isMediaPipeLoading = false;

  // Engine 1: Studio AI (IMG.LY HD Client-Side WASM/ONNX)
  function initImgly() {
    if (imglyRemoveBackground) return Promise.resolve(imglyRemoveBackground);
    if (isImglyLoading) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (imglyRemoveBackground) {
            clearInterval(check);
            resolve(imglyRemoveBackground);
          }
        }, 100);
      });
    }

    isImglyLoading = true;
    updateAiStatus('loading', 'Loading Studio AI Engine (ONNX)...');

    return import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm')
      .then((module) => {
        imglyRemoveBackground = module.removeBackground;
        isImglyLoading = false;
        updateAiStatus('ready', 'Studio AI Engine Ready');
        return imglyRemoveBackground;
      })
      .catch((err) => {
        console.warn('IMG.LY load failed, will use Fast AI fallback:', err);
        isImglyLoading = false;
        return null;
      });
  }

  function runStudioAI(imageSource) {
    updateAiStatus('loading', 'Initializing Studio AI (HD)...');

    initImgly().then((removeBgFunc) => {
      if (!removeBgFunc) {
        updateAiStatus('loading', 'Switching to Fast AI...');
        runMediaPipeAI();
        return;
      }

      updateAiStatus('loading', 'Segmenting HD Portrait...');

      const config = {
        progress: (key, current, total) => {
          if (key && key.includes('fetch')) {
            const pct = total ? Math.round((current / total) * 100) : 0;
            updateAiStatus('loading', `Downloading AI Model: ${pct}%`);
          } else {
            updateAiStatus('loading', 'Processing HD Matting...');
          }
        }
      };

      removeBgFunc(imageSource, config)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const resultImg = new Image();
          resultImg.onload = () => {
            state.master.maskedCanvas = resultImg;
            updateAiStatus('success', 'Studio AI: Background Removed (HD)');
            renderAllViews();
          };
          resultImg.src = url;
        })
        .catch((err) => {
          console.error('Studio AI failed:', err);
          updateAiStatus('error', 'Studio AI error, trying Fast AI...');
          runMediaPipeAI();
        });
    });
  }

  // Engine 2: Remove.bg Cloud API
  function runRemoveBgAPI(file, apiKey) {
    if (!apiKey || apiKey.trim() === '') {
      updateAiStatus('error', 'Remove.bg API Key Required');
      showToast('Please enter a Remove.bg API key', 'error');
      return;
    }

    updateAiStatus('loading', 'Contacting Remove.bg Cloud API...');

    const formData = new FormData();
    formData.append('image_file', file);
    formData.append('size', 'auto');

    fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey.trim()
      },
      body: formData
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((errData) => {
            throw new Error((errData.errors && errData.errors[0]?.title) || `HTTP ${response.status}`);
          });
        }
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const resultImg = new Image();
        resultImg.onload = () => {
          state.master.maskedCanvas = resultImg;
          updateAiStatus('success', 'Remove.bg: Background Removed (Ultra-HD)');
          renderAllViews();
          showToast('Remove.bg processed successfully', 'success');
        };
        resultImg.src = url;
      })
      .catch((err) => {
        console.error('Remove.bg API error:', err);
        updateAiStatus('error', 'API error: ' + err.message + ' (Falling back to Studio AI)');
        showToast('Remove.bg error: ' + err.message + '. Falling back to Studio AI.', 'error');
        runStudioAI(state.master.photoFile || state.master.photoImage.src);
      });
  }

  // Engine 3: Fast MediaPipe AI with Multi-pass Gaussian Matting
  function initMediaPipe() {
    if (selfieSegmenter) return Promise.resolve(selfieSegmenter);
    if (isMediaPipeLoading) return new Promise((res) => setTimeout(res, 400));
    if (!window.SelfieSegmentation) return Promise.resolve(null);

    isMediaPipeLoading = true;
    updateAiStatus('loading', 'Loading MediaPipe Fast AI...');

    return new Promise((resolve) => {
      try {
        selfieSegmenter = new window.SelfieSegmentation({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });

        selfieSegmenter.setOptions({ modelSelection: 1 });
        selfieSegmenter.onResults(onMediaPipeResults);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 64;
        tempCanvas.height = 64;
        selfieSegmenter.send({ image: tempCanvas })
          .then(() => {
            isMediaPipeLoading = false;
            resolve(selfieSegmenter);
          })
          .catch(() => {
            isMediaPipeLoading = false;
            resolve(selfieSegmenter);
          });
      } catch (e) {
        console.error('Failed to init MediaPipe:', e);
        isMediaPipeLoading = false;
        resolve(null);
      }
    });
  }

  function runMediaPipeAI() {
    if (!state.master.photoImage) return;
    updateAiStatus('loading', 'Segmenting with Fast AI...');

    initMediaPipe().then((segmenter) => {
      if (segmenter) {
        segmenter.send({ image: state.master.photoImage }).catch((err) => {
          console.error('MediaPipe error:', err);
          updateAiStatus('error', 'Segmentation failed');
          state.master.maskedCanvas = null;
          renderAllViews();
        });
      } else {
        updateAiStatus('idle', 'Using standard portrait');
        state.master.maskedCanvas = null;
        renderAllViews();
      }
    });
  }

  function onMediaPipeResults(results) {
    if (!results || !state.master.photoImage) return;

    const img = state.master.photoImage;
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    const rawMask = document.createElement('canvas');
    rawMask.width = width;
    rawMask.height = height;
    const rawCtx = rawMask.getContext('2d');
    rawCtx.drawImage(results.segmentationMask, 0, 0, width, height);

    const smoothMask = document.createElement('canvas');
    smoothMask.width = width;
    smoothMask.height = height;
    const smoothCtx = smoothMask.getContext('2d');
    const baseScale = Math.max(1, Math.min(width, height) / 1000);
    smoothCtx.filter = `blur(${2.5 * baseScale}px)`;
    smoothCtx.drawImage(rawMask, 0, 0);

    const imgData = smoothCtx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const threshold = (state.master.maskThreshold || 0.5) * 255;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i] >= threshold ? 255 : 0;
      data[i] = alpha;
      data[i + 1] = alpha;
      data[i + 2] = alpha;
      data[i + 3] = alpha;
    }
    smoothCtx.putImageData(imgData, 0, 0);

    const featherCanvas = document.createElement('canvas');
    featherCanvas.width = width;
    featherCanvas.height = height;
    const featherCtx = featherCanvas.getContext('2d');
    const fRadius = (state.master.maskFeather || 2.5) * baseScale;
    if (fRadius > 0) featherCtx.filter = `blur(${fRadius}px)`;
    featherCtx.drawImage(smoothMask, 0, 0);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = width;
    finalCanvas.height = height;
    const finalCtx = finalCanvas.getContext('2d');

    finalCtx.drawImage(featherCanvas, 0, 0);
    finalCtx.globalCompositeOperation = 'source-in';
    finalCtx.drawImage(img, 0, 0);

    state.master.maskedCanvas = finalCanvas;
    updateAiStatus('success', 'Fast AI: Background Removed');
    renderAllViews();
  }

  // Master Orchestrator for Background Removal
  function processBackgroundRemoval() {
    if (!state.master.photoImage) return;

    const engine = state.master.bgEngine;

    if (engine === 'none') {
      state.master.maskedCanvas = null;
      updateAiStatus('idle', 'Original photo active (No cutout)');
      renderAllViews();
      return;
    }

    if (engine === 'studio-ai') {
      runStudioAI(state.master.photoFile || state.master.photoImage.src);
    } else if (engine === 'removebg') {
      if (state.master.photoFile) {
        runRemoveBgAPI(state.master.photoFile, state.master.removebgApiKey);
      } else {
        runStudioAI(state.master.photoImage.src);
      }
    } else if (engine === 'mediapipe') {
      runMediaPipeAI();
    }
  }

  function updateAiStatus(type, msg) {
    const box = document.getElementById('ai-status-box');
    const textEl = document.getElementById('ai-status-text');
    const spinner = document.getElementById('ai-spinner');
    if (!box || !textEl) return;

    box.className = `ai-status-box ${type}`;
    textEl.textContent = msg;
    if (spinner) spinner.style.display = type === 'loading' ? 'block' : 'none';
  }

  // --- Rendering Loop for all Views ---
  function renderAllViews() {
    // 1. Overview Grid Canvases
    const ovIdCanvas = document.getElementById('overview-id-canvas');
    if (ovIdCanvas) window.IdCardRenderer.draw(ovIdCanvas, state.master, state.idCard);

    const ovVisFront = document.getElementById('overview-vis-front-canvas');
    if (ovVisFront) window.VisitingCardRenderer.drawFront(ovVisFront);

    const ovVisBack = document.getElementById('overview-vis-back-canvas');
    if (ovVisBack) window.VisitingCardRenderer.drawBack(ovVisBack, state.master, state.visitingCard);

    const ovWelcomeCanvas = document.getElementById('overview-welcome-canvas');
    if (ovWelcomeCanvas) window.WelcomeNoteRenderer.draw(ovWelcomeCanvas, state.master, state.welcomeNote);

    // 2. Focused Studio Canvases
    if (state.activeView === 'idcard') {
      const studioIdCanvas = document.getElementById('studio-id-canvas');
      if (studioIdCanvas) window.IdCardRenderer.draw(studioIdCanvas, state.master, state.idCard);
    } else if (state.activeView === 'visiting') {
      const studioVisFront = document.getElementById('studio-vis-front-canvas');
      if (studioVisFront) window.VisitingCardRenderer.drawFront(studioVisFront);

      const studioVisBack = document.getElementById('studio-vis-back-canvas');
      if (studioVisBack) window.VisitingCardRenderer.drawBack(studioVisBack, state.master, state.visitingCard);
    }

    // Always update Welcome Note Studio DOM so it is synchronized
    updateWelcomeStudioDOM();
  }

  // --- Welcome Note Interactive DOM Studio Updater ---
  function updateWelcomeStudioDOM() {
    const frame = document.getElementById('welcome-studio-frame');
    if (!frame) return;

    const wn = state.welcomeNote;
    const m = state.master;

    // 0. Base Template Image
    const baseImgEl = document.getElementById('wn-base-img');
    if (baseImgEl && window.HR_ASSETS && window.HR_ASSETS.truvibe_base) {
      if (baseImgEl.src !== window.HR_ASSETS.truvibe_base) {
        baseImgEl.src = window.HR_ASSETS.truvibe_base;
      }
    }

    // 1. Photo Layer
    const photoLayer = document.getElementById('wn-layer-photo');
    const photoImg = document.getElementById('wn-photo-img');
    const portraitSource = m.maskedCanvas ? m.maskedCanvas.toDataURL() : (m.photoDataUrl || '');

    if (photoLayer && photoImg) {
      if (portraitSource) {
        photoLayer.style.display = 'block';
        photoImg.src = portraitSource;
        photoLayer.style.left = `${wn.photoX}%`;
        photoLayer.style.top = `${wn.photoY}%`;
        photoLayer.style.width = `${wn.photoScale}%`;
        photoLayer.style.transform = `translate(-50%, -50%) rotate(${wn.photoRotate}deg) skewX(${wn.photoTilt || 0}deg)`;
      } else {
        photoLayer.style.display = 'none';
      }
    }

    // 2. Speech Bubble Layer
    const bubbleLayer = document.getElementById('wn-layer-bubble');
    const bubbleList = document.getElementById('wn-bubble-list');
    if (bubbleLayer && bubbleList) {
      bubbleLayer.style.left = `${wn.bubbleX}%`;
      bubbleLayer.style.top = `${wn.bubbleY}%`;
      bubbleLayer.style.width = `${wn.bubbleScale}%`;
      bubbleLayer.style.transform = `translate(-50%, -50%) rotate(${wn.bubbleRotate}deg)`;

      const text = wn.overrideText ? wn.bubbleText : m.bubbleText;
      const lines = window.WelcomeNoteRenderer.parseBubbleLines(text);

      if (lines.length > 0) {
        bubbleLayer.style.display = 'block';
        bubbleList.innerHTML = lines.map(item => `
          <li>
            <span style="color: #1a1a1a; font-weight: 700;">${escapeHtml(item.question)} </span>
            <span style="color: #ee6c2d; font-weight: 700;">${escapeHtml(item.answer)}</span>
          </li>
        `).join('');
      } else {
        bubbleLayer.style.display = 'none';
      }
    }

    // 3. Name & Department Layer
    const nameLayer = document.getElementById('wn-layer-name');
    const nameTitleEl = document.getElementById('wn-name-display');
    const deptTitleEl = document.getElementById('wn-dept-display');
    if (nameLayer && nameTitleEl && deptTitleEl) {
      nameLayer.style.left = `${wn.nameX}%`;
      nameLayer.style.top = `${wn.nameY}%`;
      nameLayer.style.width = `${wn.nameScale}%`;
      nameLayer.style.transform = `translate(-50%, -50%) rotate(${wn.nameRotate}deg)`;

      const empFirst = wn.overrideText ? (wn.firstName || '') : (m.firstName || (m.fullName ? m.fullName.split(' ')[0] : ''));
      const empDept = wn.overrideText ? (wn.department || '') : (m.department || '');

      nameTitleEl.textContent = empFirst;
      deptTitleEl.textContent = empDept;

      if (!empFirst && !empDept) {
        nameLayer.style.display = 'none';
      } else {
        nameLayer.style.display = 'block';
      }
    }

    updateTransformSelectionHandles();
  }

  function updateTransformSelectionHandles() {
    ['photo', 'bubble', 'name'].forEach(t => {
      const layer = document.getElementById(`wn-layer-${t}`);
      const handles = document.getElementById(`wn-handles-${t}`);
      if (layer && handles) {
        if (state.welcomeNote.selectedTarget === t) {
          layer.classList.add('selected');
          handles.style.display = 'block';
        } else {
          layer.classList.remove('selected');
          handles.style.display = 'none';
        }
      }
    });
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Setup Master Input Event Listeners ---
  function setupInputBindings() {
    // 1. Master Profile Inputs
    bindInput('master-fullname', (v) => {
      state.master.fullName = v;
      const first = v.trim().split(' ')[0] || '';
      const firstNameInput = document.getElementById('master-firstname');
      if (firstNameInput && !firstNameInput.dataset.dirty) {
        firstNameInput.value = first;
        state.master.firstName = first;
      }
      renderAllViews();
    });

    bindInput('master-firstname', (v) => {
      state.master.firstName = v;
      document.getElementById('master-firstname').dataset.dirty = 'true';
      renderAllViews();
    });

    bindInput('master-department', (v) => {
      state.master.department = v;
      renderAllViews();
    });

    bindInput('master-email', (v) => {
      state.master.email = v;
      renderAllViews();
    });

    bindInput('master-phone', (v) => {
      state.master.phone = v;
      renderAllViews();
    });

    bindInput('master-qr', (v) => {
      state.master.qrUrl = v;
      window.VisitingCardRenderer.updateQRCode(v, () => renderAllViews());
    });

    bindInput('master-cta1', (v) => {
      state.master.cta1 = v;
      renderAllViews();
    });

    bindInput('master-cta2', (v) => {
      state.master.cta2 = v;
      renderAllViews();
    });

    bindInput('master-bubble', (v) => {
      state.master.bubbleText = v;
      renderAllViews();
    });

    // 2. Photo Upload & Removal Engine
    const photoInput = document.getElementById('master-photo-input');
    const uploadZone = document.getElementById('photo-dropzone');
    const removePhotoBtn = document.getElementById('btn-remove-photo');
    const bgEngineSelect = document.getElementById('bg-engine-select');
    const removebgKeyInput = document.getElementById('removebg-api-key');

    if (bgEngineSelect) {
      bgEngineSelect.addEventListener('change', (e) => {
        state.master.bgEngine = e.target.value;
        const keyGroup = document.getElementById('removebg-key-group');
        const manualTuning = document.getElementById('manual-tuning-group');

        if (keyGroup) keyGroup.style.display = e.target.value === 'removebg' ? 'block' : 'none';
        if (manualTuning) manualTuning.style.display = e.target.value === 'mediapipe' ? 'block' : 'none';

        processBackgroundRemoval();
      });
    }

    if (removebgKeyInput) {
      removebgKeyInput.addEventListener('input', (e) => {
        state.master.removebgApiKey = e.target.value;
      });
    }

    if (uploadZone && photoInput) {
      uploadZone.addEventListener('click', () => photoInput.click());
      ['dragenter', 'dragover'].forEach(e => uploadZone.addEventListener(e, (ev) => { ev.preventDefault(); uploadZone.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach(e => uploadZone.addEventListener(e, (ev) => { ev.preventDefault(); uploadZone.classList.remove('dragover'); }));

      uploadZone.addEventListener('drop', (ev) => {
        if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
          handleUploadedPhoto(ev.dataTransfer.files[0]);
        }
      });

      photoInput.addEventListener('change', (ev) => {
        if (ev.target.files && ev.target.files.length > 0) {
          handleUploadedPhoto(ev.target.files[0]);
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => {
        state.master.photoFile = null;
        state.master.photoImage = null;
        state.master.photoDataUrl = null;
        state.master.maskedCanvas = null;
        document.getElementById('photo-preview-card').style.display = 'none';
        document.getElementById('photo-dropzone').style.display = 'block';
        updateAiStatus('idle', 'No photo uploaded');
        renderAllViews();
      });
    }

    // AI Sliders
    bindSlider('slider-ai-threshold', 'val-ai-threshold', (v) => {
      state.master.maskThreshold = parseFloat(v);
      if (state.master.photoImage && state.master.bgEngine === 'mediapipe') runMediaPipeAI();
    });

    bindSlider('slider-ai-feather', 'val-ai-feather', (v) => {
      state.master.maskFeather = parseFloat(v);
      if (state.master.photoImage && state.master.bgEngine === 'mediapipe') runMediaPipeAI();
    }, 'px');

    // 3. ID Card Controls
    bindSlider('id-slider-scale', 'id-val-scale', (v) => { state.idCard.photoScale = parseFloat(v) / 100; renderAllViews(); }, '%');
    bindSlider('id-slider-x', 'id-val-x', (v) => { state.idCard.photoX = parseFloat(v); renderAllViews(); }, 'px');
    bindSlider('id-slider-y', 'id-val-y', (v) => { state.idCard.photoY = parseFloat(v); renderAllViews(); }, 'px');
    bindSlider('id-slider-rotate', 'id-val-rotate', (v) => { state.idCard.photoRotate = parseFloat(v); renderAllViews(); }, '°');
    bindSlider('id-slider-bright', 'id-val-bright', (v) => { state.idCard.photoBrightness = parseFloat(v); renderAllViews(); }, '%');
    bindSlider('id-slider-contrast', 'id-val-contrast', (v) => { state.idCard.photoContrast = parseFloat(v); renderAllViews(); }, '%');

    const idGrayToggle = document.getElementById('id-toggle-grayscale');
    if (idGrayToggle) {
      idGrayToggle.addEventListener('change', (e) => {
        state.idCard.grayscale = e.target.checked;
        renderAllViews();
      });
    }

    const idLogoType = document.getElementById('id-logo-type');
    if (idLogoType) {
      idLogoType.addEventListener('change', (e) => {
        state.idCard.logoType = e.target.value;
        const customUpload = document.getElementById('id-custom-logo-wrap');
        if (customUpload) customUpload.style.display = e.target.value === 'custom' ? 'block' : 'none';
        renderAllViews();
      });
    }

    const customLogoInput = document.getElementById('id-custom-logo-input');
    if (customLogoInput) {
      customLogoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              state.idCard.customLogoImage = img;
              renderAllViews();
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(e.target.files[0]);
        }
      });
    }

    // ID Card Override toggle
    const idOverrideToggle = document.getElementById('id-toggle-override');
    if (idOverrideToggle) {
      idOverrideToggle.addEventListener('change', (e) => {
        state.idCard.overrideText = e.target.checked;
        document.getElementById('id-override-fields').style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked) {
          document.getElementById('id-custom-name').value = state.idCard.name || state.master.fullName;
          document.getElementById('id-custom-title').value = state.idCard.title || state.master.department;
          state.idCard.name = document.getElementById('id-custom-name').value;
          state.idCard.title = document.getElementById('id-custom-title').value;
        }
        renderAllViews();
      });
    }
    bindInput('id-custom-name', (v) => { state.idCard.name = v; renderAllViews(); });
    bindInput('id-custom-title', (v) => { state.idCard.title = v; renderAllViews(); });

    // 4. Visiting Card Controls
    const vcStackToggle = document.getElementById('vc-toggle-stack');
    if (vcStackToggle) {
      vcStackToggle.addEventListener('change', (e) => {
        state.visitingCard.stackContact = e.target.checked;
        renderAllViews();
      });
    }

    const vcOverrideToggle = document.getElementById('vc-toggle-override');
    if (vcOverrideToggle) {
      vcOverrideToggle.addEventListener('change', (e) => {
        state.visitingCard.overrideText = e.target.checked;
        document.getElementById('vc-override-fields').style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked) {
          document.getElementById('vc-custom-name').value = state.visitingCard.name || state.master.fullName;
          document.getElementById('vc-custom-dept').value = state.visitingCard.dept || state.master.department;
          document.getElementById('vc-custom-email').value = state.visitingCard.email || state.master.email;
          document.getElementById('vc-custom-phone').value = state.visitingCard.phone || state.master.phone;
          document.getElementById('vc-custom-cta1').value = state.visitingCard.cta1 || state.master.cta1;
          document.getElementById('vc-custom-cta2').value = state.visitingCard.cta2 || state.master.cta2;
          state.visitingCard.name = document.getElementById('vc-custom-name').value;
          state.visitingCard.dept = document.getElementById('vc-custom-dept').value;
          state.visitingCard.email = document.getElementById('vc-custom-email').value;
          state.visitingCard.phone = document.getElementById('vc-custom-phone').value;
          state.visitingCard.cta1 = document.getElementById('vc-custom-cta1').value;
          state.visitingCard.cta2 = document.getElementById('vc-custom-cta2').value;
        }
        renderAllViews();
      });
    }
    bindInput('vc-custom-name', (v) => { state.visitingCard.name = v; renderAllViews(); });
    bindInput('vc-custom-dept', (v) => { state.visitingCard.dept = v; renderAllViews(); });
    bindInput('vc-custom-email', (v) => { state.visitingCard.email = v; renderAllViews(); });
    bindInput('vc-custom-phone', (v) => { state.visitingCard.phone = v; renderAllViews(); });
    bindInput('vc-custom-cta1', (v) => { state.visitingCard.cta1 = v; renderAllViews(); });
    bindInput('vc-custom-cta2', (v) => { state.visitingCard.cta2 = v; renderAllViews(); });

    // 5. Welcome Note Controls
    bindSlider('wn-slider-photo-scale', 'wn-val-photo-scale', (v) => { state.welcomeNote.photoScale = parseFloat(v); renderAllViews(); }, '%');
    bindSlider('wn-slider-photo-x', 'wn-val-photo-x', (v) => { state.welcomeNote.photoX = parseFloat(v); renderAllViews(); }, '%');
    bindSlider('wn-slider-photo-y', 'wn-val-photo-y', (v) => { state.welcomeNote.photoY = parseFloat(v); renderAllViews(); }, '%');
    bindSlider('wn-slider-photo-rot', 'wn-val-photo-rot', (v) => { state.welcomeNote.photoRotate = parseFloat(v); renderAllViews(); }, '°');
    bindSlider('wn-slider-photo-tilt', 'wn-val-photo-tilt', (v) => { state.welcomeNote.photoTilt = parseFloat(v); renderAllViews(); }, '°');

    bindSlider('wn-slider-bubble-scale', 'wn-val-bubble-scale', (v) => { state.welcomeNote.bubbleScale = parseFloat(v); renderAllViews(); }, '%');
    bindSlider('wn-slider-bubble-x', 'wn-val-bubble-x', (v) => { state.welcomeNote.bubbleX = parseFloat(v); renderAllViews(); }, '%');
    bindSlider('wn-slider-bubble-y', 'wn-val-bubble-y', (v) => { state.welcomeNote.bubbleY = parseFloat(v); renderAllViews(); }, '%');

    const wnOverrideToggle = document.getElementById('wn-toggle-override');
    if (wnOverrideToggle) {
      wnOverrideToggle.addEventListener('change', (e) => {
        state.welcomeNote.overrideText = e.target.checked;
        document.getElementById('wn-override-fields').style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked) {
          document.getElementById('wn-custom-first').value = state.welcomeNote.firstName || state.master.firstName;
          document.getElementById('wn-custom-dept').value = state.welcomeNote.department || state.master.department;
          document.getElementById('wn-custom-bubble').value = state.welcomeNote.bubbleText || state.master.bubbleText;
          state.welcomeNote.firstName = document.getElementById('wn-custom-first').value;
          state.welcomeNote.department = document.getElementById('wn-custom-dept').value;
          state.welcomeNote.bubbleText = document.getElementById('wn-custom-bubble').value;
        }
        renderAllViews();
      });
    }
    bindInput('wn-custom-first', (v) => { state.welcomeNote.firstName = v; renderAllViews(); });
    bindInput('wn-custom-dept', (v) => { state.welcomeNote.department = v; renderAllViews(); });
    bindInput('wn-custom-bubble', (v) => { state.welcomeNote.bubbleText = v; renderAllViews(); });
  }

  function bindInput(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => callback(e.target.value));
  }

  function bindSlider(sliderId, valId, callback, suffix = '') {
    const slider = document.getElementById(sliderId);
    const valBadge = document.getElementById(valId);
    if (!slider) return;
    slider.addEventListener('input', (e) => {
      const v = e.target.value;
      if (valBadge) valBadge.textContent = `${v}${suffix}`;
      callback(v);
    });
  }

  function handleUploadedPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return;
    state.master.photoFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      state.master.photoDataUrl = dataUrl;

      const img = new Image();
      img.onload = () => {
        state.master.photoImage = img;

        const previewCard = document.getElementById('photo-preview-card');
        const dropzone = document.getElementById('photo-dropzone');
        const thumbImg = document.getElementById('photo-thumb-img');
        const filenameEl = document.getElementById('photo-filename');

        if (previewCard) previewCard.style.display = 'flex';
        if (dropzone) dropzone.style.display = 'none';
        if (thumbImg) thumbImg.src = dataUrl;
        if (filenameEl) filenameEl.textContent = file.name;

        processBackgroundRemoval();
        showToast('Photo uploaded. Processing cutout...', 'success');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // --- View Switcher & Sidebar Tabs ---
  function setupViewNavigation() {
    const viewButtons = document.querySelectorAll('.view-tab-btn');
    viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        switchView(targetView);
      });
    });

    const sidebarTabButtons = document.querySelectorAll('.sidebar-tab-btn');
    sidebarTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchSidebarTab(tab);
      });
    });
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.view-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });

    document.querySelectorAll('.view-section').forEach(s => {
      s.style.display = s.id === `view-${viewName}` ? 'flex' : 'none';
    });

    const assetTabBtn = document.querySelector('.sidebar-tab-btn[data-tab="asset"]');
    if (assetTabBtn) {
      const labels = {
        overview: 'Asset Adjustments',
        idcard: 'ID Card Controls',
        visiting: 'Visiting Card Controls',
        welcome: 'Welcome Note Controls'
      };
      assetTabBtn.innerHTML = `<i class="fa-solid fa-sliders"></i> ${labels[viewName] || 'Asset Controls'}`;
    }

    document.querySelectorAll('.asset-controls-sub').forEach(c => {
      c.style.display = c.id === `controls-${viewName}` ? 'block' : 'none';
    });

    renderAllViews();
  }

  function switchSidebarTab(tabName) {
    state.activeSidebarTab = tabName;
    document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });

    document.querySelectorAll('.sidebar-tab-content').forEach(c => {
      c.style.display = c.id === `tab-content-${tabName}` ? 'block' : 'none';
    });
  }

  // --- ID Card Canvas Mouse Drag-to-Pan Interaction ---
  function setupIdCardInteractions() {
    const canvas = document.getElementById('studio-id-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
      state.idCard.isDragging = true;
      state.idCard.dragStartX = e.clientX;
      state.idCard.dragStartY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.idCard.isDragging) return;
      const dx = e.clientX - state.idCard.dragStartX;
      const dy = e.clientY - state.idCard.dragStartY;
      state.idCard.dragStartX = e.clientX;
      state.idCard.dragStartY = e.clientY;

      const scaleF = 687 / canvas.getBoundingClientRect().width;
      state.idCard.photoX = Math.round(state.idCard.photoX + dx * scaleF);
      state.idCard.photoY = Math.round(state.idCard.photoY + dy * scaleF);

      const xSlider = document.getElementById('id-slider-x');
      const ySlider = document.getElementById('id-slider-y');
      const xBadge = document.getElementById('id-val-x');
      const yBadge = document.getElementById('id-val-y');

      if (xSlider) xSlider.value = state.idCard.photoX;
      if (ySlider) ySlider.value = state.idCard.photoY;
      if (xBadge) xBadge.textContent = `${state.idCard.photoX}px`;
      if (yBadge) yBadge.textContent = `${state.idCard.photoY}px`;

      renderAllViews();
    });

    window.addEventListener('mouseup', () => {
      state.idCard.isDragging = false;
    });
  }

  // --- Welcome Note Interactive Transform Handles Interaction ---
  function setupWelcomeNoteInteractions() {
    const frame = document.getElementById('welcome-studio-frame');
    if (!frame) return;

    let dragData = null;

    frame.addEventListener('pointerdown', (e) => {
      if (e.target === frame || e.target.classList.contains('poster-base-img')) {
        state.welcomeNote.selectedTarget = null;
        updateTransformSelectionHandles();
      }
    });

    ['photo', 'bubble', 'name'].forEach(target => {
      const layer = document.getElementById(`wn-layer-${target}`);
      if (!layer) return;

      layer.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('transform-handle') || e.target.classList.contains('handle-rotate')) return;
        e.preventDefault();
        e.stopPropagation();

        state.welcomeNote.selectedTarget = target;
        updateTransformSelectionHandles();

        const rect = frame.getBoundingClientRect();
        dragData = {
          target,
          mode: 'move',
          rect,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startX: state.welcomeNote[`${target}X`],
          startY: state.welcomeNote[`${target}Y`]
        };
      });

      const handles = layer.querySelectorAll('.transform-handle');
      handles.forEach(h => {
        h.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = frame.getBoundingClientRect();
          const cx = rect.left + (state.welcomeNote[`${target}X`] / 100) * rect.width;
          const cy = rect.top + (state.welcomeNote[`${target}Y`] / 100) * rect.height;

          dragData = {
            target,
            mode: 'scale',
            rect,
            cx,
            cy,
            startDist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
            startScale: state.welcomeNote[`${target}Scale`]
          };
        });
      });

      const rotateHandle = layer.querySelector('.handle-rotate');
      if (rotateHandle) {
        rotateHandle.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = frame.getBoundingClientRect();
          const cx = rect.left + (state.welcomeNote[`${target}X`] / 100) * rect.width;
          const cy = rect.top + (state.welcomeNote[`${target}Y`] / 100) * rect.height;

          dragData = {
            target,
            mode: 'rotate',
            cx,
            cy,
            startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
            startRotate: state.welcomeNote[`${target}Rotate`] || 0
          };
        });
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragData) return;
      const d = dragData;
      const target = d.target;

      if (d.mode === 'move') {
        const dxPercent = ((e.clientX - d.startClientX) / d.rect.width) * 100;
        const dyPercent = ((e.clientY - d.startClientY) / d.rect.height) * 100;
        state.welcomeNote[`${target}X`] = Math.round((d.startX + dxPercent) * 10) / 10;
        state.welcomeNote[`${target}Y`] = Math.round((d.startY + dyPercent) * 10) / 10;
      } else if (d.mode === 'scale') {
        const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
        const ratio = dist / d.startDist;
        const newScale = Math.min(120, Math.max(15, Math.round(d.startScale * ratio * 10) / 10));
        state.welcomeNote[`${target}Scale`] = newScale;
      } else if (d.mode === 'rotate') {
        const angle = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
        let deg = d.startRotate + ((angle - d.startAngle) * 180) / Math.PI;
        const snaps = [0, 45, 90, 135, 180, -45, -90, -135, -180];
        for (const s of snaps) {
          if (Math.abs(deg - s) < 3) deg = s;
        }
        state.welcomeNote[`${target}Rotate`] = Math.round(deg * 10) / 10;
      }

      renderAllViews();
    });

    window.addEventListener('pointerup', () => {
      dragData = null;
    });
  }

  // --- Export Actions ---
  function setupExportActions() {
    // 1. Download Master Batch ZIP (Contains ID Card PNG, Visiting Card PDF, Welcome Note PNG)
    const btnDownloadAll = document.getElementById('btn-download-all-zip');
    if (btnDownloadAll) {
      btnDownloadAll.onclick = function (e) {
        e.preventDefault();
        downloadAllAssetsZip();
      };
    }

    // 2. ID Card Exports
    document.querySelectorAll('.btn-download-id-png').forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault();
        try {
          const exportCanvas = window.IdCardRenderer.getExportCanvas(state.master, state.idCard, 2);
          downloadCanvasAsImage(exportCanvas, `${getCleanName()}_ID_Card.png`);
        } catch (err) {
          console.error('ID card download error:', err);
          showToast('Failed to download ID card: ' + err.message, 'error');
        }
      };
    });

    // 3. Visiting Card PDF Exports
    document.querySelectorAll('.btn-download-vis-pdf').forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault();
        try {
          window.VisitingCardRenderer.generatePDF(state.master, state.visitingCard);
          showToast('Visiting Card PDF downloaded', 'success');
        } catch (err) {
          console.error('Visiting PDF download error:', err);
          showToast('Failed to download PDF: ' + err.message, 'error');
        }
      };
    });

    // 4. Welcome Note Poster Exports
    document.querySelectorAll('.btn-download-welcome-png').forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault();
        try {
          const exportCanvas = window.WelcomeNoteRenderer.getExportCanvas(state.master, state.welcomeNote, 3);
          downloadCanvasAsImage(exportCanvas, `${getCleanName()}_Welcome_Poster.png`);
        } catch (err) {
          console.error('Welcome poster download error:', err);
          showToast('Failed to download poster: ' + err.message, 'error');
        }
      };
    });
  }

  function getCleanName() {
    return (state.master.fullName || 'Employee').trim().replace(/\s+/g, '_');
  }

  function downloadCanvasAsImage(canvas, filename, mimeType = 'image/png', quality = 1.0) {
    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 100);
      showToast(`Downloaded: ${filename}`, 'success');
    } catch (err) {
      console.error('Error generating image dataURL:', err);
      showToast('Export error: ' + err.message, 'error');
    }
  }

  function downloadAllAssetsZip() {
    if (!window.JSZip) {
      showToast('Zip library initializing...', 'info');
      return;
    }

    try {
      showToast('Packaging assets into ZIP bundle...', 'info');
      const zip = new window.JSZip();
      const cleanName = getCleanName();

      // 1. ID Card High-Res PNG
      const idCanvas = window.IdCardRenderer.getExportCanvas(state.master, state.idCard, 2);
      const idData = idCanvas.toDataURL('image/png').split(',')[1];
      zip.file(`${cleanName}_ID_Card.png`, idData, { base64: true });

      // 2. Welcome Note Poster High-Res PNG
      const wnCanvas = window.WelcomeNoteRenderer.getExportCanvas(state.master, state.welcomeNote, 3);
      const wnData = wnCanvas.toDataURL('image/png').split(',')[1];
      zip.file(`${cleanName}_Welcome_Poster.png`, wnData, { base64: true });

      // 3. Visiting Card PDF (Only PDF, without separate JPEGs)
      window.VisitingCardRenderer.generatePDF(state.master, state.visitingCard, (pdf, pdfFilename) => {
        if (pdf) {
          const pdfBlob = pdf.output('blob');
          zip.file(pdfFilename, pdfBlob);
        }

        zip.generateAsync({ type: 'blob' }).then((content) => {
          const link = document.createElement('a');
          link.download = `${cleanName}_HR_Assets.zip`;
          link.href = URL.createObjectURL(content);
          document.body.appendChild(link);
          link.click();
          setTimeout(() => document.body.removeChild(link), 100);
          showToast('Complete bundle (ID Card PNG, Visiting Card PDF, Welcome Poster PNG) downloaded in ZIP!', 'success');
        }).catch(err => {
          console.error('ZIP generation error:', err);
          showToast('Failed to create ZIP: ' + err.message, 'error');
        });
      });
    } catch (err) {
      console.error('Download all error:', err);
      showToast('Error exporting all assets: ' + err.message, 'error');
    }
  }

  function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // --- Application Initialization ---
  function initApp() {
    Promise.all([
      window.IdCardRenderer.init(),
      window.VisitingCardRenderer.init(),
      window.WelcomeNoteRenderer.init()
    ]).then(() => {
      setupInputBindings();
      setupViewNavigation();
      setupIdCardInteractions();
      setupWelcomeNoteInteractions();
      setupExportActions();

      // Set base template src from embedded assets
      const baseImgEl = document.getElementById('wn-base-img');
      if (baseImgEl && window.HR_ASSETS && window.HR_ASSETS.truvibe_base) {
        baseImgEl.src = window.HR_ASSETS.truvibe_base;
      }

      // Initial QR Code & Render with prefilled URL
      window.VisitingCardRenderer.updateQRCode(state.master.qrUrl, () => {
        renderAllViews();
      });

      // Warm up MediaPipe & Studio AI
      initImgly();
      initMediaPipe();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.fonts) {
      document.fonts.ready.then(initApp);
    } else {
      initApp();
    }
  });

})();
