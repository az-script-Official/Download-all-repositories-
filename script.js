/* ========================================
   script.js - المنطق الرئيسي
   إدارة الحسابات، التحكم بالواجهة، التحميل
   ======================================== */

(function () {
    'use strict';

    // ============ حالة التطبيق ============
    let accountCounter = 0;
    let isDownloading = false;

    // ============ عناصر DOM ============
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const accountsList = $('#accountsList');
    const addAccountBtn = $('#add-account-btn');
    const downloadAllBtn = $('#download-all-btn');
    const clearBtn = $('#clear-btn');
    const themeToggle = $('#theme-toggle');
    const progressSection = $('#progress-section');
    const overallProgress = $('#overallProgress');
    const overallProgressFill = $('#overallProgressFill');
    const accountProgressList = $('#accountProgressList');
    const resultsSection = $('#results-section');
    const resultsHeader = $('#results-header');
    const resultsList = $('#results-list');
    const errorContainer = $('#error-container');

    // ============ تهيئة ============
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        // إضافة event listener لزر حذف الحساب الأول (الموجود في HTML)
        const firstEntry = accountsList.querySelector('.account-entry');
        if (firstEntry) {
            const firstRemoveBtn = firstEntry.querySelector('.remove-account-btn');
            if (firstRemoveBtn) {
                firstRemoveBtn.addEventListener('click', () => {
                    if (!isDownloading) {
                        firstEntry.style.animation = 'none';
                        firstEntry.style.opacity = '0';
                        firstEntry.style.transform = 'translateY(-10px)';
                        firstEntry.style.transition = 'all 0.2s ease';
                        setTimeout(() => {
                            firstEntry.remove();
                            updateRemoveButtons();
                        }, 200);
                    }
                });
            }
        }

        // إضافة الحساب الثاني (الحساب الأول موجود في HTML)
        addAccountEntry();

        // زر إضافة حساب
        addAccountBtn.addEventListener('click', () => {
            if (!isDownloading) {
                addAccountEntry();
            }
        });

        // زر التحميل
        downloadAllBtn.addEventListener('click', startDownload);

        // زر المسح
        clearBtn.addEventListener('click', resetAll);

        // تبديل التيم
        themeToggle.addEventListener('click', toggleTheme);

        // تحميل التيم المحفوظ
        loadSavedTheme();

        // أحداث الإدخال
        accountsList.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('account-input')) {
                e.preventDefault();
                if (!isDownloading) addAccountEntry();
            }
        });

        accountsList.addEventListener('input', (e) => {
            if (e.target.classList.contains('account-input')) {
                errorContainer.style.display = 'none';
                updateAvatars();
            }
        });
    }

    // ============ إدارة الحسابات ============

    function addAccountEntry() {
        const index = accountCounter++;
        const entry = document.createElement('div');
        entry.className = 'account-entry';
        entry.dataset.index = index;
        entry.innerHTML = `
            <div class="input-wrapper">
                <span class="user-avatar">
                    <i class="fas fa-user input-icon" id="default-avatar-${index}"></i>
                    <img src="" id="profile-avatar-${index}" class="profile-avatar" style="display:none;" alt="">
                </span>
                <input type="text" class="account-input subscription-input"
                    placeholder="أدخل اسم مستخدم أو رابط حساب GitHub"
                    data-index="${index}" autocomplete="off">
            </div>
            <button class="glow-button icon-button remove-account-btn"
                data-index="${index}" title="حذف الحساب">
                <i class="fas fa-times button-icon"></i>
            </button>
        `;

        accountsList.appendChild(entry);

        // حدث حذف الحساب
        const removeBtn = entry.querySelector('.remove-account-btn');
        removeBtn.addEventListener('click', () => {
            if (!isDownloading) {
                entry.style.animation = 'none';
                entry.style.opacity = '0';
                entry.style.transform = 'translateY(-10px)';
                entry.style.transition = 'all 0.2s ease';
                setTimeout(() => {
                    entry.remove();
                    updateRemoveButtons();
                }, 200);
            }
        });

        // تحديث حالة الأزرار
        updateRemoveButtons();

        // التركيز على الحقل الجديد
        setTimeout(() => {
            const input = entry.querySelector('.account-input');
            if (input) input.focus();
        }, 100);
    }

    function updateRemoveButtons() {
        const entries = accountsList.querySelectorAll('.account-entry');
        entries.forEach((entry, i) => {
            const btn = entry.querySelector('.remove-account-btn');
            btn.style.visibility = entries.length > 1 ? 'visible' : 'hidden';
        });
    }

    function getAccountEntries() {
        return Array.from(accountsList.querySelectorAll('.account-entry'));
    }

    function getAccountNames() {
        const entries = getAccountEntries();
        const names = [];

        entries.forEach(entry => {
            const input = entry.querySelector('.account-input');
            const raw = input.value.trim();
            if (raw) {
                const username = parseGitHubUsername(raw);
                if (username && !names.includes(username)) {
                    names.push(username);
                }
            }
        });

        return names;
    }

    function parseGitHubUsername(input) {
        let cleaned = input.trim();
        cleaned = cleaned.replace(/^https?:\/\//i, '');
        cleaned = cleaned.replace(/^www\./i, '');
        cleaned = cleaned.replace(/^github\.com\/?/i, '');
        cleaned = cleaned.replace(/\/+$/, '');
        cleaned = cleaned.split('/')[0];
        return cleaned || null;
    }

    async function updateAvatars() {
        const entries = getAccountEntries();
        entries.forEach(entry => {
            const input = entry.querySelector('.account-input');
            const raw = input.value.trim();
            const username = parseGitHubUsername(raw);
            const defaultAvatar = entry.querySelector('.input-icon');
            const profileAvatar = entry.querySelector('.profile-avatar');

            if (username) {
                // عرض الأفاتار من API
                const img = new Image();
                img.onload = () => {
                    defaultAvatar.style.display = 'none';
                    profileAvatar.src = img.src;
                    profileAvatar.style.display = 'block';
                };
                img.onerror = () => {
                    defaultAvatar.style.display = 'block';
                    profileAvatar.style.display = 'none';
                };
                img.src = `https://github.com/${username}.png?size=40`;
            } else {
                defaultAvatar.style.display = 'block';
                profileAvatar.style.display = 'none';
                profileAvatar.src = '';
            }
        });
    }

    // ============ التحميل ============

    async function startDownload() {
        if (isDownloading) return;

        const usernames = getAccountNames();

        if (usernames.length === 0) {
            showError('يرجى إدخال اسم مستخدم GitHub واحد على الأقل');
            return;
        }

        // التحقق من وجود حسابات مكررة في المدخلات
        const entries = getAccountEntries();
        const rawInputs = entries.map(e => e.querySelector('.account-input').value.trim()).filter(Boolean);
        if (rawInputs.length === 0) {
            showError('يرجى إدخال اسم مستخدم GitHub واحد على الأقل');
            return;
        }

        isDownloading = true;

        // تعطيل الأزرار أثناء التحميل
        downloadAllBtn.disabled = true;
        downloadAllBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin button-icon"></i><span>جاري التحميل...</span>';
        addAccountBtn.disabled = true;
        clearBtn.style.display = 'none';

        // عرض قسم التقدم
        showProgressSection(usernames);

        // إخفاء النتائج السابقة
        resultsSection.style.display = 'none';
        errorContainer.style.display = 'none';

        // بدء التحميل التسلسلي
        try {
            const results = await startSequentialDownload(usernames, {
                onAccountStart: (index, username) => {
                    updateAccountProgress(index, 'active', username, 'جاري التحميل...', 0, 0);
                },

                onAccountProgress: (index, completed, total, status) => {
                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                    updateAccountProgress(index, 'active', null, status, completed, total, pct);
                },

                onAccountComplete: (index, username, reposCount, fileSize, message) => {
                    const pct = 100;
                    updateAccountProgress(index, 'completed', username, message, reposCount, reposCount, pct, fileSize);
                },

                onAccountError: (index, username, message) => {
                    updateAccountProgress(index, 'error', username, message, 0, 0, 0);
                },

                onOverallProgress: (completed, total) => {
                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                    overallProgress.textContent = `${completed} / ${total}`;
                    overallProgressFill.style.width = `${pct}%`;
                },

                onAllComplete: (results) => {
                    showResults(results);
                }
            });
        } catch (error) {
            showError(`حدث خطأ غير متوقع: ${error.message}`);
        } finally {
            isDownloading = false;
            downloadAllBtn.disabled = false;
            downloadAllBtn.innerHTML = '<i class="fas fa-download button-icon"></i><span>بدء التحميل</span>';
            addAccountBtn.disabled = false;
            clearBtn.style.display = 'flex';
        }
    }

    // ============ واجهة التقدم ============

    function showProgressSection(accounts) {
        progressSection.style.display = 'block';

        // بناء عناصر التقدم لكل حساب
        let html = '';
        accounts.forEach((username, i) => {
            html += `
                <div class="account-progress-item waiting" id="account-progress-${i}">
                    <span class="account-progress-icon waiting" id="account-icon-${i}">
                        <i class="fas fa-clock"></i>
                    </span>
                    <div class="account-progress-info">
                        <div class="account-progress-name" id="account-name-${i}">${username}</div>
                        <div class="account-progress-status" id="account-status-${i}">في الانتظار...</div>
                    </div>
                    <div class="account-progress-bar-mini">
                        <div class="account-progress-bar-mini-fill" id="account-bar-${i}" style="width:0%"></div>
                    </div>
                    <span class="account-progress-repos" id="account-repos-${i}">-</span>
                </div>
            `;
        });
        accountProgressList.innerHTML = html;

        overallProgress.textContent = `0 / ${accounts.length}`;
        overallProgressFill.style.width = '0%';

        // التمرير إلى قسم التقدم
        progressSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateAccountProgress(index, state, username, statusText, completed, total, pct, fileSize) {
        const item = document.getElementById(`account-progress-${index}`);
        if (!item) return;

        // تحديث الحالة
        item.className = `account-progress-item ${state}`;

        // تحديث الأيقونة
        const icon = document.getElementById(`account-icon-${index}`);
        if (icon) {
            icon.className = `account-progress-icon ${state}`;
            const iconMap = {
                waiting: 'fa-clock',
                active: 'fa-spinner fa-spin',
                completed: 'fa-check-circle',
                error: 'fa-exclamation-circle'
            };
            icon.innerHTML = `<i class="fas ${iconMap[state] || 'fa-clock'}"></i>`;
        }

        // تحديث الاسم
        if (username) {
            const nameEl = document.getElementById(`account-name-${index}`);
            if (nameEl) nameEl.textContent = username;
        }

        // تحديث الحالة
        const statusEl = document.getElementById(`account-status-${index}`);
        if (statusEl && statusText) {
            statusEl.textContent = statusText;
        }

        // تحديث شريط التقدم
        if (pct !== undefined) {
            const bar = document.getElementById(`account-bar-${index}`);
            if (bar) bar.style.width = `${pct}%`;
        }

        // تحديث عدد المستودعات
        const reposEl = document.getElementById(`account-repos-${index}`);
        if (reposEl && total > 0) {
            reposEl.textContent = `${completed}/${total}`;
        } else if (reposEl && state === 'completed') {
            reposEl.textContent = fileSize || '-';
        } else if (reposEl && state === 'error') {
            reposEl.textContent = 'خطأ';
        }
    }

    // ============ عرض النتائج ============

    function showResults(results) {
        resultsSection.style.display = 'block';

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        resultsHeader.innerHTML = `
            <h3><i class="fas fa-check-double"></i> اكتمل التحميل</h3>
            <span class="results-count">${successCount} نجح${failCount > 0 ? ` | ${failCount} فشل` : ''}</span>
        `;

        let html = '';
        results.forEach(r => {
            const isSuccess = r.success;
            const icon = isSuccess ? 'fa-check-circle' : 'fa-times-circle';
            const cls = isSuccess ? 'success' : 'fail';
            const size = isSuccess ? formatFileSize(r.fileSize) : '';
            const filename = isSuccess ? r.filename : r.message;

            html += `
                <div class="result-item ${cls}">
                    <i class="fas ${icon}"></i>
                    <span class="result-filename" title="${filename}">${filename}</span>
                    <span class="result-size">${size}</span>
                </div>
            `;
        });

        resultsList.innerHTML = html;

        // التمرير إلى النتائج
        setTimeout(() => {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ============ إعادة التعيين ============

    function resetAll() {
        if (isDownloading) return;

        // مسح جميع حقول الحسابات
        const entries = getAccountEntries();
        entries.forEach((entry, i) => {
            if (i > 0) {
                entry.remove();
            } else {
                const input = entry.querySelector('.account-input');
                input.value = '';
                const defaultAvatar = entry.querySelector('.input-icon');
                const profileAvatar = entry.querySelector('.profile-avatar');
                defaultAvatar.style.display = 'block';
                profileAvatar.style.display = 'none';
                profileAvatar.src = '';
            }
        });

        // إخفاء الأقسام
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        errorContainer.style.display = 'none';
        clearBtn.style.display = 'none';

        // إعادة تعيين العداد
        accountCounter = 1;

        updateRemoveButtons();
    }

    // ============ التيم ============

    function toggleTheme() {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');

        themeToggle.innerHTML = isLight
            ? '<i class="fas fa-sun button-icon"></i>'
            : '<i class="fas fa-moon button-icon"></i>';

        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    }

    function loadSavedTheme() {
        const saved = localStorage.getItem('theme');
        if (saved === 'light') {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            themeToggle.innerHTML = '<i class="fas fa-sun button-icon"></i>';
        }
    }

    // ============ عرض الأخطاء ============

    function showError(message) {
        errorContainer.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        errorContainer.style.display = 'flex';

        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 6000);
    }

})();
