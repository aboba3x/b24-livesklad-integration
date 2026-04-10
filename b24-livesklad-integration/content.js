const checkedPhones = new Set();

const ALLOWED_LS_STATUSES = [
    "Новый",
    "Ожидает Диагностики",
    "Диагностика",
    "В работе",
    "На Аутсорсе",
    "Ошибка в заказе",
    "На согласовании",
    "Ждет запчасть",
    "Ожидает ремонта",
    "Доставка",
    "Выкуплен",
    "Ждет владельца",
    "Забытые (1 мес и более)",
    "На утилизацию",
    "Закрыт",
    "Проверен"
];

function processTableRows() {
    const rows = document.querySelectorAll('.orders-table tbody.vt-body tr.vtr');

    rows.forEach(row => {
        const statusElement = row.querySelector('.col-status .order-status-label');
        if (!statusElement) return;
        
        const statusText = statusElement.innerText.trim();

        // Проверяем статус в LiveSklad
        if (!ALLOWED_LS_STATUSES.includes(statusText)) return;

        const phoneElements = row.querySelectorAll('.col-phone .subtext-order:not(.b24-checked)');
        
        phoneElements.forEach(phoneEl => {
            const phone = phoneEl.innerText.trim();
            if (!phone || phone.length < 5) return;

            phoneEl.classList.add('b24-checked');

            if (checkedPhones.has(phone)) return;
            checkedPhones.add(phone);

            // Отправляем телефон нашему фоновому скрипту (который перешлет на прокси)
            chrome.runtime.sendMessage(
                { action: "checkPhoneInBitrix", phone: phone },
                (response) => {
                    // Если сделка нашлась в Битриксе
                    if (response && response.success && response.found) {
                        
                        // ПЕРЕДАЕМ ВСЕ ПАРАМЕТРЫ, ВКЛЮЧАЯ ИНФОРМАЦИЮ О ЗАКРЫТИИ (response.wasClosed)
                        injectBadge(phoneEl, true, response.dealId, response.wasClosed);
                        
                        // Формируем текст уведомления в зависимости от того, закрылась сделка или нет
                        const notificationMsg = response.wasClosed 
                            ? `Сделка с номером ${phone} автоматически успешно закрыта в B24!` 
                            : `Сделка с номером ${phone} требует внимания в B24!`;

                        chrome.runtime.sendMessage({ 
                            action: "showNotification", 
                            title: "Автоматизация B24", 
                            message: notificationMsg 
                        });
                    }
                }
            );
        });
    });
}

function injectBadge(element, isFound, dealId, wasClosed) {
    const badge = document.createElement('span');
    badge.style.marginLeft = '8px';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '4px';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = 'bold';
    
    if (wasClosed) {
        // Если робот успешно закрыл сделку
        badge.style.backgroundColor = '#d1e7dd';
        badge.style.color = '#0f5132';
        badge.style.border = '1px solid #badbcc';
        badge.innerText = '✅ Закрыта в B24';
        badge.title = 'Эта сделка автоматически переведена в статус "Успешна" в Битрикс24';
    } else {
        // Если сделка нашлась, но по какой-то причине не закрылась
        badge.style.backgroundColor = '#fff3cd';
        badge.style.color = '#664d03';
        badge.style.border = '1px solid #ffecb5';
        badge.innerText = '⚠️ Найдена в B24 (Требует внимания)';
    }
    
    element.parentNode.insertBefore(badge, element.nextSibling);
}

// Защита от работы без авторизации
const observer = new MutationObserver(() => {
    clearTimeout(window.phoneCheckTimeout);
    window.phoneCheckTimeout = setTimeout(processTableRows, 800);
});

// Проверяем, залогинился ли сотрудник
chrome.storage.local.get(['isAuthorized'], (result) => {
    if (result.isAuthorized) {
        observer.observe(document.body, { childList: true, subtree: true });
        processTableRows();
    } else {
        console.log("Ожидание авторизации через токен...");
    }
});

// Если сотрудник только что ввел токен - запускаем проверку
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.isAuthorized && changes.isAuthorized.newValue === true) {
        observer.observe(document.body, { childList: true, subtree: true });
        processTableRows();
    }
});