const MY_SERVER_API = 'https://m-up.ru/api/proxy.php';

// === ЗАМЕНИ ЭТИ ID НА РЕАЛЬНЫЕ ID ТВОЕЙ ВОРОНКИ БИТРИКСА ===
// Реальные системные ID твоих этапов в Битрикс24
const TARGET_STAGES = [
    'NEW',           // Новая
    'PREPARATION',   // В работе
    'UC_0SI4LX',     // Существующий заказ
    'UC_UUVNLG',     // Не отвечает
    'UC_0M57NO',     // Записан на диагностику
    'UC_1768OO'      // Приедет сам/зап. позже
];

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Безопасный запрос через твой сервер
async function fetchViaProxy(b24Query) {
    const { employeeToken, deviceId } = await chrome.storage.local.get(['employeeToken', 'deviceId']);
    if (!employeeToken || !deviceId) throw new Error("Пользователь не авторизован");

    const encodedQuery = encodeURIComponent(b24Query);
    const url = `${MY_SERVER_API}?action=proxy_b24&token=${employeeToken}&device_id=${deviceId}&query=${encodedQuery}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data || data.error) throw new Error(data?.error || "Ошибка сервера API"); 
    return data;
}

// 1. Получаем список сделок для всплывающего окна
async function getActiveDealsData() {
    try {
        const stageQuery = TARGET_STAGES.map((stage, index) => `filter[@STAGE_ID][${index}]=${encodeURIComponent(stage)}`).join('&');
        const b24Query = `crm.deal.list.json?${stageQuery}&select[]=ID&select[]=TITLE`;
        
        const data = await fetchViaProxy(b24Query);
        return { success: true, count: data.total || 0, deals: data.result || [] };
    } catch (error) {
        console.error("Ошибка getActiveDealsData:", error);
        return { success: false, error: error.message };
    }
}

// 2. Проверяем номер телефона (по запросу от content.js)
async function checkBitrixFlow(phone) {
    try {
        const cleanPhone = phone.replace(/\D/g, ''); 
        if (cleanPhone.length < 5) return { success: false, error: "Короткий номер" };

        await delay(600); // Защита от лимитов Битрикса

        const contactQuery = `crm.duplicate.findbycomm.json?type=PHONE&values[]=${cleanPhone}`;
        const contactData = await fetchViaProxy(contactQuery);
        
        if (!contactData.result || !contactData.result.CONTACT) {
            return { success: true, found: false };
        }

        const contactIds = contactData.result.CONTACT;

        for (const contactId of contactIds) {
            await delay(600); 

            const dealQuery = `crm.deal.list.json?filter[CONTACT_ID]=${contactId}&select[]=STAGE_ID&select[]=ID`;
            const dealData = await fetchViaProxy(dealQuery);

            if (dealData.result && dealData.result.length > 0) {
                for (const deal of dealData.result) {
                    if (TARGET_STAGES.includes(deal.STAGE_ID)) {
                        return { success: true, found: true, dealId: deal.ID }; 
                    }
                }
            }
        }
        return { success: true, found: false };
    } catch (error) {
        console.error("Ошибка checkBitrixFlow:", error);
        return { success: false, error: error.message };
    }
}

// Слушатель сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkPhoneInBitrix") { 
        checkBitrixFlow(request.phone).then(sendResponse); 
        return true; 
    }
    if (request.action === "getActiveDealsData") { 
        getActiveDealsData().then(sendResponse); 
        return true; 
    }
    if (request.action === "showNotification") {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // Заглушка, чтобы не выдавало ошибку отсутствия иконки
            title: request.title,
            message: request.message,
            priority: 2
        });
    }
});