// Memastikan PC tidak "tidur" supaya alarm boleh berfungsi
chrome.power.requestKeepAwake('system');

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzcNd7EcLGEBxuwl4CYmjqLbdJpsRXJM4D709lvCFY3IN-HE4Z8Fm_KdQuO111nJnHM/exec";

// 1. Fungsi Utama: Menjadualkan Semua Alarm (Dengan Jitter Saat Rawak)
function scheduleAllAlarms() {
    chrome.storage.local.get(null, (res) => {
        if (!res) return;

        const tasks = [
            { name: 'daftarMasuk', time: res.time_masuk },
            { name: 'daftarKeluar', time: res.time_keluar },
            { name: 'p1', time: res.p1 },
            { name: 'p2', time: res.p2 },
            { name: 'p3', time: res.p3 },
            { name: 'p4', time: res.p4 },
            { name: 'p5', time: res.p5 },
            { name: 'p6', time: res.p6 },
            { name: 'p7', time: res.p7 }
        ];

        tasks.forEach(task => {
            if (task.time) {
                const [jam, minit] = task.time.split(':');
                const now = new Date();
                let targetDate = new Date();
                targetDate.setHours(parseInt(jam), parseInt(minit), 0, 0);

                // Jika waktu sudah lepas untuk hari ini, set untuk esok
                if (targetDate <= now) {
                    targetDate.setDate(targetDate.getDate() + 1);
                }

                // JITTER: Jam & Minit tepat, hanya saat diubah secara rawak (0 - 59 saat)
                const jitterMs = Math.floor(Math.random() * 59 * 1000);
                const finalTime = targetDate.getTime() + jitterMs;

                chrome.alarms.create(task.name, { when: finalTime });
                console.log(`[SPOT-MI3] Alarm ${task.name} diset untuk: ${new Date(finalTime).toLocaleString()}`);
            }
        });
    });
}

// 2. Setup Awal
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.clearAll();
    scheduleAllAlarms();
});

chrome.runtime.onStartup.addListener(() => {
    scheduleAllAlarms();
});

// 3. Listener untuk Update Tetapan dari Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateSettings") {
        console.log("[SPOT-MI3] Tetapan dikemaskini, menjadualkan semula...");
        chrome.alarms.clearAll();
        scheduleAllAlarms();
        if (sendResponse) sendResponse({ status: "success" });
    }
});

// 4. Listener apabila Alarm berbunyi (Semak Bulan Sekali & Amaran 3 Hari)
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'midnightReset') return;

    const action = alarm.name; 
    const finalAction = (action.startsWith('p')) ? 'daftarPergerakan' : action;
    
    console.log(`[SPOT-MI3] Alarm berbunyi: ${action}. Melakukan: ${finalAction}`);
    
    chrome.storage.local.get(null, async (res) => {
        const email = res.userEmail;

        if (email) {
            try {
                const today = new Date();
                const currentMonth = today.toISOString().slice(0, 7); 
                
                let statusAktif = res.statusCache || "ACTIVE";
                let expiryDate = res.expiryDate;

                if (res.lastCheckMonth !== currentMonth) {
                    console.log("[SPOT-MI3] Menyemak status lesen bulanan dengan pelayan...");
                    const response = await fetch(`${GAS_WEB_APP_URL}?email=${encodeURIComponent(email)}`);
                    const data = await response.json();

                    statusAktif = data.status;
                    expiryDate = data.expiryDate;

                    chrome.storage.local.set({ 
                        statusCache: statusAktif, 
                        expiryDate: expiryDate,
                        lastCheckMonth: currentMonth 
                    });
                }

                if (expiryDate) {
                    const expTime = new Date(expiryDate).getTime();
                    const nowTime = today.getTime();
                    const diffDays = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));

                    if (diffDays <= 3 && diffDays >= 0) {
                        console.warn(`[SPOT-MI3] AMARAN: Langganan tamat dalam ${diffDays} hari.`);
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: 'icon.png',
                            title: 'SpotMi3: Langganan Hampir Tamat',
                            message: `Langganan anda akan tamat dalam ${diffDays} hari lagi. Sila buat pembaharuan segera.`,
                            priority: 2
                        });
                    }
                }

                if (statusAktif !== "ACTIVE") {
                    console.warn("[SPOT-MI3] Langganan tidak aktif. Automasi dibatalkan.");
                    return;
                }
            } catch (err) {
                console.error("[SPOT-MI3] Ralat menyemak pelayan lesen, meneruskan cache sedia ada:", err);
            }
        }

        triggerAutomation(finalAction, res);
    });

    setTimeout(() => {
        scheduleAllAlarms();
    }, 5000); 
});

// 5. Fungsi Automasi
function triggerAutomation(action, data) {
    chrome.tabs.query({ url: "*://spotme.jdn.gov.my/*" }, (tabs) => {
        if (tabs.length === 0) return;
        
        const tabId = tabs[0].id;
        chrome.tabs.update(tabId, { active: true }, () => {
            executeScriptAndSend(tabId, action, data);
        });
    });
}

function executeScriptAndSend(tabId, action, data) {
    chrome.tabs.sendMessage(tabId, { action: action, data: data }, (response) => {
        if (chrome.runtime.lastError) {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            }, () => {
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, { action: action, data: data });
                }, 1000);
            });
        }
    });
}