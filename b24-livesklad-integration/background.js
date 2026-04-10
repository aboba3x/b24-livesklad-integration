const MY_SERVER_API = 'https://m-up.ru/api/proxy.php';

// Этапы, на которых мы ИЩЕМ сделку для закрытия
const TARGET_STAGES = ['NEW', 'PREPARATION', 'UC_0SI4LX', 'UC_UUVNLG', 'UC_0M57NO', 'UC_1768OO'];

// Системный ID для успешного закрытия (обычно это WON)
const CLOSED_WON_STAGE = 'WON';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

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

// Функция автоматического закрытия сделки
async function autoCloseDeal(dealId) {
    try {
        // Команда на обновление сделки в Битрикс24
        const updateQuery = `crm.deal.update.json?id=${dealId}&fields[STAGE_ID]=${CLOSED_WON_STAGE}`;
        const result = await fetchViaProxy(updateQuery);
        return result.result; // Вернет true, если успешно
    } catch (error) {
        console.error("Ошибка при автоматическом закрытии сделки:", error);
        return false;
    }
}

async function checkBitrixFlow(phone) {
    try {
        let cleanPhone = phone.replace(/\D/g, ''); 
        if (cleanPhone.length < 10) return { success: false, error: "Короткий номер" };

        let phone7 = cleanPhone;
        let phone8 = cleanPhone;
        if (cleanPhone.length === 11) {
            const core = cleanPhone.substring(1);
            phone7 = '7' + core;
            phone8 = '8' + core;
        }

        await delay(600);
        const contactQuery = `crm.duplicate.findbycomm.json?type=PHONE&values[]=${phone7}&values[]=${phone8}`;
        const contactData = await fetchViaProxy(contactQuery);
        
        if (!contactData.result || !contactData.result.CONTACT) return { success: true, found: false };

        const contactIds = contactData.result.CONTACT;

        for (const contactId of contactIds) {
            await delay(600); 
            const dealQuery = `crm.deal.list.json?filter[CONTACT_ID]=${contactId}&select[]=STAGE_ID&select[]=ID`;
            const dealData = await fetchViaProxy(dealQuery);

            if (dealData.result && dealData.result.length > 0) {
                for (const deal of dealData.result) {
                    if (TARGET_STAGES.includes(deal.STAGE_ID)) {
                        
                        // !!! ВОТ ОНО — АВТОМАТИЧЕСКОЕ ЗАКРЫТИЕ !!!
                        const closed = await autoCloseDeal(deal.ID);
                        
                        return { 
                            success: true, 
                            found: true, 
                            dealId: deal.ID,
                            wasClosed: closed // Сообщаем в content.js, что сделка закрыта
                        }; 
                    }
                }
            }
        }
        return { success: true, found: false };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkPhoneInBitrix") { checkBitrixFlow(request.phone).then(sendResponse); return true; }
    if (request.action === "getActiveDealsData") { 
        // Функция для модального окна остается прежней
        const stageQuery = TARGET_STAGES.map((s, i) => `filter[@STAGE_ID][${i}]=${s}`).join('&');
        fetchViaProxy(`crm.deal.list.json?${stageQuery}&select[]=ID&select[]=TITLE`).then(sendResponse);
        return true;
    }
});