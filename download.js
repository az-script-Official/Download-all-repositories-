/* ========================================
   download.js - محرك التحميل التسلسلي
   يتعامل مع: تحميل المستودعات، إنشاء ZIP
   ======================================== */

const WORKER_URL = "https://git-zip.tahmasebimoein140.workers.dev/";

// ============ دوال إنشاء ZIP ============

function crc32(buf) {
    const table = window.crcTable || (window.crcTable = (function () {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            t[n] = c;
        }
        return t;
    })());

    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

function numToBytes(num, bytes) {
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) {
        arr[i] = num & 0xFF;
        num = num >>> 8;
    }
    return arr;
}

function stringToBytes(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

function concatArrays(arrays) {
    const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    arrays.forEach(arr => {
        result.set(arr instanceof Uint8Array ? arr : new Uint8Array(arr), offset);
        offset += arr.length;
    });
    return result;
}

function createZip(files) {
    const localFiles = [];
    const centralDirectory = [];
    let offset = 0;

    files.forEach(file => {
        const filenameBytes = stringToBytes(file.name);
        const crc = crc32(file.data);

        const localHeader = concatArrays([
            numToBytes(0x04034b50, 4),  // التوقيع
            numToBytes(20, 2),           // إصدار مطلوب
            numToBytes(0, 2),            // الأعلام
            numToBytes(0, 2),            // طريقة الضغط (بدون)
            numToBytes(0, 2),            // وقت التعديل
            numToBytes(0, 2),            // تاريخ التعديل
            numToBytes(crc, 4),          // CRC32
            numToBytes(file.data.length, 4),  // الحجم المضغوط
            numToBytes(file.data.length, 4),  // الحجم الأصلي
            numToBytes(filenameBytes.length, 2),
            numToBytes(0, 2),
            filenameBytes
        ]);

        localFiles.push(localHeader);
        localFiles.push(file.data);

        const centralHeader = concatArrays([
            numToBytes(0x02014b50, 4),
            numToBytes(20, 2),
            numToBytes(20, 2),
            numToBytes(0, 2),
            numToBytes(0, 2),
            numToBytes(0, 2),
            numToBytes(0, 2),
            numToBytes(crc, 4),
            numToBytes(file.data.length, 4),
            numToBytes(file.data.length, 4),
            numToBytes(filenameBytes.length, 2),
            numToBytes(0, 2),
            numToBytes(0, 2),
            numToBytes(0, 2),
            numToBytes(0, 2),
            numToBytes(0, 4),
            numToBytes(offset, 4),
            filenameBytes
        ]);

        centralDirectory.push(centralHeader);
        offset += localHeader.length + file.data.length;
    });

    const centralData = concatArrays(centralDirectory);

    const eocd = concatArrays([
        numToBytes(0x06054b50, 4),
        numToBytes(0, 2),
        numToBytes(0, 2),
        numToBytes(files.length, 2),
        numToBytes(files.length, 2),
        numToBytes(centralData.length, 4),
        numToBytes(offset, 4),
        numToBytes(0, 2)
    ]);

    return concatArrays([concatArrays(localFiles), centralData, eocd]);
}

// ============ دوال التحميل ============

/**
 * تحميل ملف ZIP لمستودع واحد عبر الـ Worker
 */
async function fetchRepoZip(zipUrl) {
    const workerUrl = `${WORKER_URL}?url=${encodeURIComponent(zipUrl)}`;
    const resp = await fetch(workerUrl);
    if (!resp.ok) throw new Error(`فشل تحميل: ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
}

/**
 * تحميل جميع مستودعات حساب واحد بالتوازي
 * @param {Array} repos - قائمة المستودعات
 * @param {Function} onProgress - دالة التقدم (current, total, repoName)
 * @returns {Array} - قائمة الملفات {name, data}
 */
async function downloadReposForAccount(repos, onProgress) {
    const files = [];
    let completed = 0;
    const total = repos.length;
    const errors = [];

    // تحميل بالتوازي (حد أقصى 5 في نفس الوقت لتحسين السرعة)
    const CONCURRENT = 5;

    async function processRepo(index) {
        const repo = repos[index];
        const repoName = repo.name;
        const defaultBranch = repo.default_branch || 'main';
        const zipUrl = `${repo.html_url}/archive/refs/heads/${defaultBranch}.zip`;

        try {
            const data = await fetchRepoZip(zipUrl);
            files[index] = { name: `${repoName}.zip`, data };
        } catch (err) {
            errors.push({ repo: repoName, error: err.message });
            console.error(`خطأ في تحميل ${repoName}:`, err.message);
        } finally {
            completed++;
            if (onProgress) {
                onProgress(completed, total, repoName);
            }
        }
    }

    // معالجة الدفعات
    for (let i = 0; i < total; i += CONCURRENT) {
        const batch = [];
        for (let j = i; j < Math.min(i + CONCURRENT, total); j++) {
            batch.push(processRepo(j));
        }
        await Promise.all(batch);
    }

    return { files: files.filter(Boolean), errors };
}

/**
 * تشغيل تحميل تسلسلي لعدة حسابات
 * @param {Array} accounts - قائمة أسماء المستخدمين
 * @param {Object} callbacks - دوال الاستدعاء
 */
async function startSequentialDownload(accounts, callbacks) {
    const {
        onAccountStart,
        onAccountProgress,
        onAccountComplete,
        onAccountError,
        onAllComplete,
        onOverallProgress
    } = callbacks;

    const results = [];
    let globalCompleted = 0;
    const globalTotal = accounts.length;

    for (let i = 0; i < accounts.length; i++) {
        const username = accounts[i];

        // تحديث التقدم العام
        if (onOverallProgress) {
            onOverallProgress(globalCompleted, globalTotal);
        }

        // بدء تحميل هذا الحساب
        if (onAccountStart) {
            onAccountStart(i, username);
        }

        try {
            // جلب قائمة المستودعات
            const repos = await fetchAllRepos(username);

            if (repos.length === 0) {
                if (onAccountComplete) {
                    onAccountComplete(i, username, 0, null, 'لا توجد مستودعات عامة');
                }
                results.push({
                    username,
                    success: false,
                    reposCount: 0,
                    message: 'لا توجد مستودعات عامة'
                });
                globalCompleted++;
                continue;
            }

            // تحديث حالة التقدم
            if (onAccountProgress) {
                onAccountProgress(i, 0, repos.length, 'جاري تحميل المستودعات...');
            }

            // تحميل المستودعات بالتوازي
            const { files, errors } = await downloadReposForAccount(repos, (completed, total, repoName) => {
                if (onAccountProgress) {
                    onAccountProgress(i, completed, total, `تحميل: ${repoName}`);
                }
            });

            if (files.length === 0) {
                if (onAccountError) {
                    onAccountError(i, username, 'فشل تحميل جميع المستودعات');
                }
                results.push({
                    username,
                    success: false,
                    reposCount: 0,
                    message: 'فشل تحميل جميع المستودعات'
                });
                globalCompleted++;
                continue;
            }

            // إنشاء ملف ZIP باسم BX_اسم_المستخدم.zip
            const zipData = createZip(files);
            const filename = `BX_${username}.zip`;
            const fileSize = zipData.length;

            // تفعيل التحميل
            triggerDownload(zipData, filename);

            // انتظار قصير قبل الحساب التالي
            if (i < accounts.length - 1) {
                await sleep(1500);
            }

            const msg = errors.length > 0
                ? `${files.length} مستودع ناجح، ${errors.length} فشل`
                : `${files.length} مستودع`;

            if (onAccountComplete) {
                onAccountComplete(i, username, files.length, formatFileSize(fileSize), msg);
            }

            results.push({
                username,
                success: true,
                filename,
                fileSize,
                reposCount: files.length,
                errors: errors.length,
                message: msg
            });

        } catch (error) {
            if (onAccountError) {
                onAccountError(i, username, error.message);
            }
            results.push({
                username,
                success: false,
                reposCount: 0,
                message: error.message
            });
        }

        globalCompleted++;
    }

    // تحديث التقدم النهائي
    if (onOverallProgress) {
        onOverallProgress(globalTotal, globalTotal);
    }

    if (onAllComplete) {
        onAllComplete(results);
    }

    return results;
}

// ============ دوال مساعدة ============

function triggerDownload(data, filename) {
    const blob = new Blob([data], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function fetchAllRepos(username) {
    const allRepos = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const response = await fetch(
            `https://api.github.com/users/${username}/repos?type=public&per_page=${perPage}&page=${page}`
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.message || `خطأ ${response.status}: ${response.statusText}`);
        }

        const repos = await response.json();
        allRepos.push(...repos);

        if (repos.length < perPage) break;
        page++;
    }

    return allRepos;
}
