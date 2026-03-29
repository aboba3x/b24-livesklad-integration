const MY_SERVER_API = 'https://m-up.ru/api/proxy.php';
const B24_DOMAIN = 'https://mac-lab.bitrix24.ru';

document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    const pinInput = document.getElementById('pin-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const headerActions = document.getElementById('header-actions');

    chrome.storage.local.get(['employeeToken', 'deviceId'], (result) => {
        let deviceId = result.deviceId;
        if (!deviceId) {
            deviceId = crypto.randomUUID(); 
            chrome.storage.local.set({ deviceId: deviceId });
        }

        if (result.employeeToken) {
            showApp();
        } else {
            showLogin();
        }
    });

    loginBtn.addEventListener('click', async () => {
        const token = pinInput.value.trim();
        if (!token) return;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Проверка...';
        loginError.style.display = 'none';

        const { deviceId } = await chrome.storage.local.get('deviceId');

        try {
            const response = await fetch(`${MY_SERVER_API}?action=auth&token=${token}&device_id=${deviceId}`);
            const data = await response.json();

            if (data.success) {
                chrome.storage.local.set({ employeeToken: token, isAuthorized: true }, () => {
                    showApp();
                });
            } else {
                loginError.textContent = data.error || 'Ошибка авторизации';
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.textContent = 'Сервер m-up.ru недоступен';
            loginError.style.display = 'block';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Войти';
        }
    });

    logoutBtn.addEventListener('click', logout);

    function showLogin(errorMsg = '') {
        appScreen.style.display = 'none';
        headerActions.style.display = 'none';
        loginScreen.style.display = 'block';
        pinInput.value = '';
        if (errorMsg) {
            loginError.textContent = errorMsg;
            loginError.style.display = 'block';
        }
    }

    function showApp() {
        loginScreen.style.display = 'none';
        appScreen.style.display = 'block';
        headerActions.style.display = 'block';
        loadDeals();
    }

    function logout() {
        chrome.storage.local.remove(['employeeToken', 'isAuthorized'], () => {
            showLogin();
        });
    }

    function loadDeals() {
        const summaryEl = document.getElementById('summary');
        const listEl = document.getElementById('deal-list');

        chrome.runtime.sendMessage({ action: "getActiveDealsData" }, (response) => {
            if (response && response.success) {
                summaryEl.textContent = `Сделок, требующих внимания: ${response.count}`;
                
                if (response.deals.length === 0) {
                    listEl.innerHTML = '<li class="loading">Нет сделок на отслеживаемых этапах 🎉</li>';
                    return;
                }

                listEl.innerHTML = '';
                response.deals.forEach(deal => {
                    const li = document.createElement('li');
                    li.className = 'deal-item';
                    
                    const a = document.createElement('a');
                    a.className = 'deal-link';
                    a.href = `${B24_DOMAIN}/crm/deal/details/${deal.ID}/`;
                    a.target = '_blank'; 
                    a.title = deal.TITLE || `Сделка #${deal.ID}`; 
                    a.textContent = deal.TITLE || `Сделка #${deal.ID}`;
                    
                    li.appendChild(a);
                    listEl.appendChild(li);
                });
            } else {
                // Если сервер вернул БАН или другую ошибку с токеном
                if (response?.error && (response.error.includes('токен') || response.error.includes('компьютер') || response.error.includes('Бан') || response.error.includes('ха-ха'))) {
                    logout();
                    showLogin(response.error);
                } else {
                    summaryEl.textContent = "Ошибка загрузки";
                    listEl.innerHTML = `<li class="error">${response?.error || 'Сбой связи с сервером'}</li>`;
                }
            }
        });
    }
});