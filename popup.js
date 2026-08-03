const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzcNd7EcLGEBxuwl4CYmjqLbdJpsRXJM4D709lvCFY3IN-HE4Z8Fm_KdQuO111nJnHM/exec";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Senarai Nilai Asal SpotMi3
    const defaults = {
        'userEmail': '',
        'userName': '',
        'ulasan': 'BDR',
        'sebab_bdr': 'Jarak perjalanan yang jauh ke pejabat serta peningkatan kos bahan api',
        'sebab_lewat': 'Tiada',
        'sebab_kurang_jam': 'Tiada',
        'catatan_tugasan': 'Menyediakan reka bentuk grafik mengikut arahan dan tempoh pelaksanaan yang ditetapkan',
        'time_masuk': '07:30',
        'time_keluar': '16:30',
        'p1': '08:30', 'p2': '09:30', 'p3': '10:30',
        'p4': '11:30', 'p5': '12:30', 'p6': '14:30', 'p7': '15:30'
    };

    const ids = Object.keys(defaults);

    // 2. Semak pendaftaran pengguna
    chrome.storage.local.get(ids, async (data) => {
        const savedEmail = data.userEmail;

        if (!savedEmail) {
            // Pemasangan baru: Tunjuk borang daftar
            document.getElementById('registerView').classList.remove('hidden');
            document.getElementById('mainView').classList.add('hidden');
        } else {
            // Pengguna sedia ada: Tunjuk menu asal
            document.getElementById('registerView').classList.add('hidden');
            document.getElementById('mainView').classList.remove('hidden');
            
            // Isikan data ke borang asal
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = (data[id] !== undefined && data[id] !== "") ? data[id] : defaults[id];
                }
            });
            
            // Semak status lesen di latar belakang
            await checkAndUpdateLicenseStatus(savedEmail);
        }
    });

    // 3. Butang Daftar (Pendaftaran Pertama Kali)
    const btnSubmitReg = document.getElementById('btnSubmitReg');
    if (btnSubmitReg) {
        btnSubmitReg.addEventListener('click', async () => {
            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim();

            if (!name || !email) {
                alert("Sila isi nama dan e-mel dengan lengkap!");
                return;
            }

            // Simpan maklumat ke storage
            chrome.storage.local.set({ userEmail: email, userName: name }, async () => {
                try {
                    await fetch(`${GAS_WEB_APP_URL}?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
                } catch (e) { 
                    console.log("Sync error"); 
                }

                document.getElementById('registerView').classList.add('hidden');
                document.getElementById('mainView').classList.remove('hidden');
                location.reload();
            });
        });
    }

    // 4. Semak Status Lesen & Amaran
    async function checkAndUpdateLicenseStatus(email) {
        const footerEmail = document.getElementById('footerEmail');
        const footerStatus = document.getElementById('footerStatus');
        const footerExpiry = document.getElementById('footerExpiry');
        const alertBanner = document.getElementById('alertBanner');

        if (footerEmail) footerEmail.textContent = email;
        if (footerStatus) footerStatus.textContent = "Menyemak...";

        try {
            const storageData = await chrome.storage.local.get(["dailyToken", "tokenDate", "userName"]);
            const todayStr = new Date().toISOString().slice(0, 10);
            let localToken = (storageData.tokenDate === todayStr && storageData.dailyToken) ? storageData.dailyToken : "";
            let currentName = storageData.userName || "Pengguna Baru";

            // Hantar e-mel, nama dan token bersama-sama ke GAS supaya pautan bil ToyyibPay terhasil
            const response = await fetch(`${GAS_WEB_APP_URL}?email=${encodeURIComponent(email)}&name=${encodeURIComponent(currentName)}&token=${encodeURIComponent(localToken)}`);
            const resData = await response.json();

            // Format Tarikh
            const expiryFormatted = resData.expiryDate ? new Date(resData.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : "-";

            if (resData.status === "ACTIVE") {
                let statusLabel = (resData.type === "PRO") ? "Berbayar" : "Percubaan";
                if (footerStatus) footerStatus.textContent = statusLabel;
                if (footerExpiry) footerExpiry.textContent = expiryFormatted;

                // Jika baki 3 hari atau kurang, tunjuk peringatan atas menu
                if (resData.daysLeft !== undefined && resData.daysLeft <= 3 && resData.daysLeft >= 0) {
                    if (alertBanner) {
                        alertBanner.style.display = "block";
                        alertBanner.innerHTML = `⚠️ Langganan akan tamat dalam <b>${resData.daysLeft} hari lagi</b>. <a href="${resData.paymentLink}" target="_blank" style="color: #4a90e2; font-weight: bold;">Langgan Sekarang</a>`;
                    }
                } else {
                    if (alertBanner) alertBanner.style.display = "none";
                }

                if (resData.dailyToken) {
                    chrome.storage.local.set({ dailyToken: resData.dailyToken, tokenDate: todayStr });
                }

            } else {
                // JIKA TAMAT TEMPOH
                if (footerStatus) {
                    footerStatus.innerHTML = `Langganan anda telah tamat. <a href="${resData.paymentLink}" target="_blank" style="color: #d9534f; font-weight: bold; text-decoration: underline;">Buat Bayaran Di Sini</a>`;
                }
                if (footerExpiry) footerExpiry.textContent = expiryFormatted;
                if (alertBanner) alertBanner.style.display = "none";
            }

        } catch (err) {
            if (footerStatus) footerStatus.textContent = "Gagal berhubung dengan pelayan";
        }
    }

    // 5. Simpan Tetapan Asal
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const data = {};
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) data[id] = el.value;
            });

            chrome.storage.local.set(data, () => {
                try {
                    chrome.runtime.sendMessage({ action: "updateSettings" }, (response) => {
                        if (chrome.runtime.lastError) {}
                    });
                } catch (e) { }

                const status = document.getElementById('status');
                if (status) {
                    status.textContent = "Tetapan Berjaya Disimpan!";
                    setTimeout(() => { status.textContent = ""; }, 2000);
                }
            });
        });
    }
});