// Idempotent: Elakkan double listener
if (!window.hasSpotMeListener) {
    window.hasSpotMeListener = true;
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const validActions = ['daftarMasuk', 'daftarKeluar', 'daftarPergerakan'];
        
        if (validActions.includes(request.action)) {
            console.log("[SpotMi3] Mesej diterima:", request.action);
            processAutomation(request.action, request.data);
        } else {
            console.log("[SpotMi3] Mesej diabaikan (Action tidak sah):", request.action);
        }
        
        sendResponse({ status: "ok" });
        return true; 
    });
}

function processAutomation(action, data) {
    if (window.spotMeInterval) clearInterval(window.spotMeInterval);

    const btnMap = { 
        'daftarMasuk': 'Daftar Masuk', 
        'daftarKeluar': 'Daftar Keluar', 
        'daftarPergerakan': 'Daftar Pergerakan' 
    };
    
    const targetBtn = btnMap[action];

    if (!document.querySelector('mat-dialog-container')) {
        const trigger = Array.from(document.querySelectorAll('button')).find(b => 
            b.innerText && b.innerText.includes(targetBtn)
        );
        
        if (trigger) {
            console.log(`[SpotMi3] Menekan butang pembuka: ${targetBtn}`);
            trigger.click();
        } else {
            console.log(`[SpotMi3] Butang ${targetBtn} tidak dijumpai di halaman.`);
            return;
        }
    }

    // Tunggu modal muncul (Polling 10 saat)
    let attempts = 0;
    window.spotMeInterval = setInterval(() => {
        const modal = document.querySelector('mat-dialog-container');
        attempts++;

        if (modal) {
            console.log("[SpotMi3] Modal ditemui!");
            clearInterval(window.spotMeInterval);
            executeFill(modal, data);
        } else if (attempts >= 20) {
            console.log("[SpotMi3] Gagal mengesan modal dalam tempoh masa yang ditetapkan.");
            clearInterval(window.spotMeInterval);
        }
    }, 500);
}

function executeFill(modal, data) {
    const clean = (text) => text ? text.replace(/:/g, '').trim().toLowerCase() : "";
    
    // Beri masa 1 saat untuk Angular Material selesai merender elemen dalam dialog
    setTimeout(() => {
        const mapping = {
            "Ulasan": data.ulasan,
            "Sebab Bekerja Dari Rumah": data.sebab_bdr,
            "Sebab Lewat": data.sebab_lewat,
            "Sebab Tidak Cukup Jam": data.sebab_kurang_jam
        };

        // --- PROSES 1: MENGISI MEDAN INPUT/TEXTAREA ANGULAR ---
        const fields = modal.querySelectorAll('.mat-mdc-form-field, .mat-form-field');
        
        fields.forEach(field => {
            const label = field.querySelector('label, mat-label');
            if (!label) return;
            const labelText = clean(label.innerText);
            
            for (let key in mapping) {
                if (labelText.includes(clean(key))) {
                    const input = field.querySelector('textarea, input');
                    
                    if (input && mapping[key]) {
                        console.log(`[SpotMi3] Mengisi Input: ${key} dengan nilai: ${mapping[key]}`);
                        
                        input.focus();

                        // Gunakan Native Setter supaya Angular Reactive Forms mengesan perubahan nilai
                        const nativeSetter = Object.getOwnPropertyDescriptor(
                            input.constructor.prototype, "value"
                        )?.set || Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement.prototype, "value"
                        )?.set;

                        if (nativeSetter) {
                            nativeSetter.call(input, mapping[key]);
                        } else {
                            input.value = mapping[key];
                        }

                        // Tembak event penuh untuk mencetuskan pengesahan Angular
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }
            }
        });

        // --- PROSES 2: MENGISI CATATAN TUGASAN (CKEDITOR) ---
        if (data.catatan_tugasan) {
            const editorDiv = modal.querySelector('.ck-editor__editable[contenteditable="true"]');

            if (editorDiv) {
                console.log("[SpotMi3] CKEditor ditemui, menyuntik nota tugas...");
                editorDiv.focus();

                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', data.catatan_tugasan);
                
                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: dataTransfer,
                    bubbles: true,
                    cancelable: true
                });

                editorDiv.dispatchEvent(pasteEvent);
                editorDiv.dispatchEvent(new Event('input', { bubbles: true }));
                editorDiv.dispatchEvent(new Event('change', { bubbles: true }));
                editorDiv.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            }
        }

        // --- PROSES 3: MENEKAN BUTANG HANTAR / SIMPAN ---
        setTimeout(() => {
            const allButtons = Array.from(modal.querySelectorAll('button'));
            const btn = allButtons.find(b => 
                b.innerText && 
                ['daftar', 'simpan', 'keluar', 'hantar', 'kemaskini'].some(k => b.innerText.toLowerCase().includes(k)) &&
                !b.innerText.toLowerCase().includes('batal')
            );
            
            if (btn) {
                console.log("[SpotMi3] Status butang hantar (disabled):", btn.disabled);
                if (!btn.disabled) {
                    console.log("[SpotMi3] Butang hantar/simpan ditekan.");
                    btn.click();
                } else {
                    console.log("[SpotMi3] Butang masih disabled. Membuang sekatan atribut secara paksa...");
                    btn.removeAttribute('disabled');
                    btn.classList.remove('mat-button-disabled', 'mdc-button--disabled');
                    btn.click();
                }
            } else {
                console.log("[SpotMi3] Butang hantar/simpan tidak dijumpai.");
            }
        }, 1500);

    }, 1000); 
}