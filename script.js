// 1. 初始化資料庫
const db = new Dexie('CharacterDB');
db.version(2).stores({
    characters: '++id, name, birthday, source, image, userBirthdayMessage',
    settings: 'key'
});

// 2. DOM 元素選擇與全域變數
const charModal = document.getElementById('char-modal');
const userBdayModal = document.getElementById('user-bday-modal');
const characterList = document.getElementById('character-list');
const charForm = document.getElementById('char-form');
const userBdayForm = document.getElementById('user-bday-form');
const imagePreview = document.getElementById('image-preview');
const charImageInput = document.getElementById('char-image');
const currentUserBdayEl = document.getElementById('current-user-bday');
const importExcelInput = document.getElementById('import-excel-input');
const categoryFilter = document.getElementById('category-filter'); // 新增篩選器

let currentView = 'card'; // 'card' or 'list'

// 3. 事件監聽器
window.onload = async () => {
    setupEventListeners();
    await populateCategoryFilter(); // 初始載入時先填充分類
    await loadCharacters();
    await loadUserBirthdayDisplay();
    await checkBirthdays();
    requestNotificationPermission();
};

function setupEventListeners() {
    document.getElementById('add-char-btn').onclick = openAddModal;
    document.getElementById('set-user-bday-btn').onclick = () => userBdayModal.style.display = 'block';
    
    // 匯入與匯出
    document.getElementById('export-excel-btn').onclick = exportToExcel;
    document.getElementById('import-excel-btn').onclick = () => importExcelInput.click();
    importExcelInput.onchange = handleFileImport;
    
    // 視圖切換
    document.getElementById('view-card-btn').onclick = () => switchView('card');
    document.getElementById('view-list-btn').onclick = () => switchView('list');

    // 篩選器事件
    categoryFilter.onchange = loadCharacters;

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.onclick = () => {
            charModal.style.display = 'none';
            userBdayModal.style.display = 'none';
        };
    });

    window.onclick = (event) => {
        if (event.target == charModal || event.target == userBdayModal) {
            charModal.style.display = 'none';
            userBdayModal.style.display = 'none';
        }
    };

    charForm.onsubmit = addOrUpdateCharacter;
    userBdayForm.onsubmit = saveUserBirthday;

    charImageInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            toBase64(file).then(dataUrl => {
                imagePreview.src = dataUrl;
                imagePreview.style.display = 'block';
            });
        }
    };
}


// 4. 核心功能函式

/**
 * 填充分類篩選器的選項
 */
async function populateCategoryFilter() {
    const allCharacters = await db.characters.toArray();
    // 使用 Set 來自動取得所有不重複的分類 (source)
    const categories = [...new Set(allCharacters.map(char => char.source).filter(Boolean))];
    
    // 保存目前選中的值
    const currentFilterValue = categoryFilter.value;

    categoryFilter.innerHTML = '<option value="all">-- 顯示全部 --</option>'; // 重置選項
    
    categories.sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });

    // 嘗試還原之前的選項
    categoryFilter.value = currentFilterValue;
}

/**
 * 切換視圖模式
 */
function switchView(viewName) {
    currentView = viewName;
    document.getElementById('view-card-btn').classList.toggle('active', viewName === 'card');
    document.getElementById('view-list-btn').classList.toggle('active', viewName === 'list');
    loadCharacters(); // 重新載入以應用新視圖
}

/**
 * 載入並渲染角色列表 (包含篩選邏輯)
 */
async function loadCharacters() {
    characterList.innerHTML = '';
    let characters = await db.characters.toArray();
    const selectedCategory = categoryFilter.value;

    // *** 篩選邏輯 ***
    if (selectedCategory && selectedCategory !== 'all') {
        characters = characters.filter(char => char.source === selectedCategory);
    }

    if (currentView === 'list') {
        characters.sort((a, b) => a.birthday.localeCompare(b.birthday));
    }

    if (characters.length === 0) {
        characterList.innerHTML = '<p>沒有符合條件的角色。</p>';
        return;
    }

    const todayMMDD = getTodayMMDD();

    characters.forEach(char => {
        const isBirthday = char.birthday === todayMMDD;
        const card = document.createElement('div');
        card.className = 'char-card';
        if (isBirthday) card.classList.add('birthday-today');

        const birthdayDisplay = isBirthday ? `${char.name} 🎂` : char.name;
        const sourceDisplay = char.source || '未分類';

        if (currentView === 'card') {
            card.innerHTML = `
                <img src="${char.image || 'https://via.placeholder.com/100'}" alt="${char.name}">
                <h3>${birthdayDisplay}</h3>
                <p><strong>分類:</strong> ${sourceDisplay}</p>
                <p><strong>生日:</strong> ${char.birthday}</p>
                <div class="card-actions">
                    <button class="edit-btn" onclick="openEditModal(${char.id})">編輯</button>
                    <button class="delete-btn" onclick="deleteCharacter(${char.id})">刪除</button>
                </div>
            `;
        } else { // list view
            card.innerHTML = `
                <div class="char-info">
                    <img src="${char.image || 'https://via.placeholder.com/100'}" alt="${char.name}">
                    <div>
                        <h3>${birthdayDisplay}</h3>
                        <p><strong>生日:</strong> ${char.birthday} | <strong>分類:</strong> ${sourceDisplay}</p>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="openEditModal(${char.id})">編輯</button>
                    <button class="delete-btn" onclick="deleteCharacter(${char.id})">刪除</button>
                </div>
            `;
        }
        characterList.appendChild(card);
    });
    
    characterList.className = currentView === 'list' ? 'list-view' : '';
}

/**
 * 新增或更新角色資料
 */
async function addOrUpdateCharacter(event) {
    event.preventDefault();
    // ... (此函式內容不變)
    const id = document.getElementById('char-id').value ? Number(document.getElementById('char-id').value) : null;
    const birthday = document.getElementById('char-birthday').value.substring(5);
    
    const charData = {
        name: document.getElementById('char-name').value,
        birthday: birthday,
        source: document.getElementById('char-source').value.trim(),
        userBirthdayMessage: document.getElementById('user-bday-message').value,
    };

    const imageFile = charImageInput.files[0];
    if (imageFile) {
        charData.image = await toBase64(imageFile);
    } else if (id) {
        const oldChar = await db.characters.get(id);
        charData.image = oldChar.image;
    } else {
        charData.image = '';
    }

    try {
        if (id) {
            await db.characters.update(id, charData);
            alert('角色更新成功！');
        } else {
            await db.characters.add(charData);
            alert('角色新增成功！');
        }
    } catch (error) {
        alert('操作失敗: ' + error);
    }

    charModal.style.display = 'none';
    await populateCategoryFilter(); // 更新分類選項
    await loadCharacters();
}

/**
 * 刪除角色
 */
async function deleteCharacter(id) {
    if (confirm('確定要刪除這位角色嗎？')) {
        await db.characters.delete(id);
        await populateCategoryFilter(); // 更新分類選項
        await loadCharacters();
    }
}

/**
 * 處理 Excel 檔案匯入
 */
async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

            if (jsonData.length === 0) {
                alert('Excel 檔案中沒有資料。');
                return;
            }

            const charactersToAdd = jsonData.map(row => {
                 if (!row.name || !row.birthday || !row.userBirthdayMessage) {
                    console.warn('發現一筆不完整的資料，已略過:', row);
                    return null;
                }
                const birthdayStr = String(row.birthday).trim();
                if (!/^\d{1,2}-\d{1,2}$/.test(birthdayStr)) {
                     console.warn(`生日格式不符 (應為 MM-DD)，已略過: ${birthdayStr}`, row);
                     return null;
                }
                return {
                    name: String(row.name),
                    birthday: birthdayStr,
                    source: row.source ? String(row.source).trim() : '',
                    userBirthdayMessage: String(row.userBirthdayMessage),
                    image: '',
                };
            }).filter(Boolean);

            if (charactersToAdd.length === 0) {
                alert('沒有成功解析任何有效的角色資料，請檢查檔案內容與格式。');
                return;
            }

            await db.characters.bulkAdd(charactersToAdd);
            alert(`成功匯入 ${charactersToAdd.length} 筆資料！`);
            await populateCategoryFilter(); // 更新分類選項
            await loadCharacters();

        } catch (error) {
            console.error('匯入失敗:', error);
            alert('匯入失敗，請檢查檔案格式是否正確，或查看 console 的錯誤訊息。');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// ... (其他函式 openAddModal, openEditModal, saveUserBirthday, loadUserBirthdayDisplay, checkBirthdays, exportToExcel 保持不變)
// ... (輔助函式 getTodayMMDD, requestNotificationPermission, showNotification, toBase64 保持不變)

// 為了版面簡潔，此處省略未變動的函式，請直接複製貼上整個 script.js 檔案的內容

function openAddModal(){charForm.reset(),document.getElementById("char-id").value="",document.getElementById("modal-title").innerText="新增角色",imagePreview.style.display="none",imagePreview.src="#",charModal.style.display="block"}async function openEditModal(e){const t=await db.characters.get(e);t&&(document.getElementById("modal-title").innerText="編輯角色",document.getElementById("char-id").value=t.id,document.getElementById("char-name").value=t.name,document.getElementById("char-birthday").value=`2000-${t.birthday}`,document.getElementById("char-source").value=t.source,document.getElementById("user-bday-message").value=t.userBirthdayMessage,t.image?(imagePreview.src=t.image,imagePreview.style.display="block"):(imagePreview.style.display="none",imagePreview.src="#"),charImageInput.value="",charModal.style.display="block")}async function saveUserBirthday(e){e.preventDefault();const t=document.getElementById("user-birthday").value.substring(5);await db.settings.put({key:"userBirthday",value:t}),alert("您的生日已儲存！"),userBdayModal.style.display="none",await loadUserBirthdayDisplay()}async function loadUserBirthdayDisplay(){const e=await db.settings.get("userBirthday");currentUserBdayEl.textContent=e?e.value:"尚未設定"}async function checkBirthdays(){const e=getTodayMMDD(),t=await db.characters.where("birthday").equals(e).toArray();t.forEach(e=>{showNotification("角色生日提醒",`今天是 ${e.name} 的生日喔！`,e.image)});const a=await db.settings.get("userBirthday");if(a&&a.value===e){const e=await db.characters.toArray();e.forEach(e=>{showNotification(`來自 ${e.name} 的祝福`,e.userBirthdayMessage||"祝你生日快樂！",e.image)})}}async function exportToExcel(){const e=await db.characters.toArray();if(0===e.length)return alert("沒有資料可以匯出。");const t=e.map(({id:e,image:t,...a})=>a),a=XLSX.utils.json_to_sheet(t),r=XLSX.utils.book_new();XLSX.utils.book_append_sheet(r,a,"角色生日列表"),XLSX.writeFile(r,"character_birthdays.xlsx")}function getTodayMMDD(){const e=new Date,t=String(e.getMonth()+1).padStart(2,"0"),a=String(e.getDate()).padStart(2,"0");return`${t}-${a}`}function requestNotificationPermission(){"Notification"in window&&"granted"!==Notification.permission&&"denied"!==Notification.permission&&Notification.requestPermission()}function showNotification(e,t,a){"Notification"in window&&"granted"===Notification.permission&&new Notification(e,{body:t,icon:a})}function toBase64(e){return new Promise((t,a)=>{const r=new FileReader;r.readAsDataURL(e),r.onload=()=>t(r.result),r.onerror=e=>a(e)})}
