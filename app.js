document.addEventListener("DOMContentLoaded", () => {
    let db;

    const API_KEY = 'AIzaSyDPGQ3H0qq70HzqQ5zErT_u3UGmDTA3kRc';  // ここにGoogle Translate APIキーを入力します

    // 日本語キーワードを英語に翻訳する関数
    async function translateKeyword(keyword) {
        console.log('Translating keyword:', keyword); // デバッグ: 翻訳するキーワードをログ出力
        const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`, {
            method: 'POST',
            body: JSON.stringify({
                q: keyword,
                target: 'en',
                source: 'ja',
                format: 'text'  // フォーマットを明示的に指定
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Translation request failed:', response.status, response.statusText, errorData);
            return keyword; // エラーが発生した場合は元のキーワードを返す
        }

        const data = await response.json();
        console.log('Translated keyword:', data.data.translations[0].translatedText); // デバッグ: 翻訳結果をログ出力
        return data.data.translations[0].translatedText;
    }

    // IndexedDBの削除
    function deleteDB() {
        let deleteRequest = indexedDB.deleteDatabase("emojiDB");

        deleteRequest.onsuccess = function(event) {
            console.log("IndexedDB deleted successfully");
            initDB(); // データベース削除後に再初期化
        };

        deleteRequest.onerror = function(event) {
            console.error("Error deleting database: " + event.target.errorCode);
        };
    }

    // IndexedDBの初期化
    function initDB() {
        let request = indexedDB.open("emojiDB", 1);

        request.onupgradeneeded = function(event) {
            console.log("onupgradeneeded: Creating database schema");
            db = event.target.result;
            let objectStore = db.createObjectStore("emojis", { keyPath: "hexcode" });
            objectStore.createIndex("annotation", "annotation", { unique: false });
            console.log("Index 'annotation' created");

            objectStore.transaction.oncomplete = function(event) {
                console.log("Database schema created, loading data");
                fetch('openmoji.json')
                    .then(response => response.json())
                    .then(data => {
                        let emojiObjectStore = db.transaction("emojis", "readwrite").objectStore("emojis");
                        data.forEach(emoji => {
                            emojiObjectStore.add(emoji);
                        });
                        console.log("Data loaded into IndexedDB");
                    })
                    .catch(error => console.error("Failed to load openmoji.json:", error));
            };
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            console.log("IndexedDB initialized successfully");

            // データベースが初期化された後に検索イベントを追加
            setupSearch();
        };

        request.onerror = function(event) {
            console.error("Database error: " + event.target.errorCode);
        };
    }

    function setupSearch() {
        let selectedEmojis = ["", "", ""];
        let currentIndexes = [0, 0, 0];
        let emojiResults = [[], [], []]; // 検索結果を保持する配列

        document.querySelectorAll('input').forEach((input, index) => {
            input.addEventListener('input', async (e) => {
                const searchKey = e.target.value.toLowerCase();
                console.log('Input received:', searchKey); // デバッグ: 入力されたキーワードをログ出力
                const emojiCircle = document.getElementById(`emoji${index + 1}`);
                
                const translatedKey = await translateKeyword(searchKey); // 日本語キーワードを翻訳
                console.log('Translated key:', translatedKey); // デバッグ: 翻訳されたキーワードをログ出力

                searchEmoji(translatedKey, (emojis) => {
                    console.log('Emojis found:', emojis); // デバッグ: 検索結果をログ出力
                    emojiResults[index] = emojis; // 検索結果を保持
                    if (emojis.length > 0) {
                        currentIndexes[index] = 0;
                        emojiCircle.innerText = emojis[0];
                        selectedEmojis[index] = emojis[0];
                        emojiCircle.dataset.searchKey = searchKey;
                    } else {
                        emojiCircle.innerText = "";
                        selectedEmojis[index] = "";
                    }
                });
            });
        });

        document.querySelectorAll('.emoji-circle').forEach((circle, index) => {
            circle.addEventListener('click', () => {
                const emojis = emojiResults[index];
                if (emojis.length > 0) {
                    currentIndexes[index] = (currentIndexes[index] + 1) % emojis.length;
                    circle.innerText = emojis[currentIndexes[index]];
                    selectedEmojis[index] = emojis[currentIndexes[index]];
                }
            });

            circle.addEventListener('touchstart', handleTouchStart, false);
            circle.addEventListener('touchmove', handleTouchMove, false);

            let xDown = null;
            let yDown = null;

            function handleTouchStart(evt) {
                const firstTouch = (evt.touches || evt.originalEvent.touches)[0];
                xDown = firstTouch.clientX;
                yDown = firstTouch.clientY;
            };

            function handleTouchMove(evt) {
                if (!xDown || !yDown) {
                    return;
                }

                let xUp = evt.touches[0].clientX;
                let yUp = evt.touches[0].clientY;

                let xDiff = xDown - xUp;
                let yDiff = yDown - yUp;

                if (Math.abs(xDiff) > Math.abs(yDiff)) {
                    const emojis = emojiResults[index];
                    if (xDiff > 0) {
                        // 左から右へスワイプ
                        currentIndexes[index] = (currentIndexes[index] + 1) % emojis.length;
                    } else {
                        // 右から左へスワイプ
                        currentIndexes[index] = (currentIndexes[index] - 1 + emojis.length) % emojis.length;
                    }
                    circle.innerText = emojis[currentIndexes[index]];
                    selectedEmojis[index] = emojis[currentIndexes[index]];
                }

                xDown = null;
                yDown = null;
            }
        });

        document.getElementById('confirm-btn').addEventListener('click', () => {
            document.querySelector('.container').style.display = 'none';
            document.getElementById('emojiDisplay').style.display = 'block';
            selectedEmojis.forEach((emoji, index) => {
                document.getElementById(`display${index + 1}`).innerText = emoji;
            });
        });
    }

    // 絵文字を検索する（部分一致検索）
    async function searchEmoji(keyword, callback) {
        console.log('Searching for keyword:', keyword); // デバッグ: 検索キーワードをログ出力
        if (!db) {
            console.error("Database not initialized");
            return;
        }
        let transaction = db.transaction(["emojis"], "readonly");
        let objectStore = transaction.objectStore("emojis");
        let index = objectStore.index("annotation");
        let request = index.openCursor();

        let results = [];
        request.onsuccess = function(event) {
            let cursor = event.target.result;
            if (cursor) {
                let value = cursor.value.annotation.toLowerCase();
                console.log('Checking:', value); // デバッグ: 検索中の値をログ出力
                if (value.includes(keyword)) {
                    results.push(cursor.value.emoji);
                }
                cursor.continue();
            } else {
                console.log('Search results:', results); // デバッグ: 検索結果をログ出力
                callback(results);
            }
        };

        request.onerror = function(event) {
            console.error("Search error: " + event.target.errorCode);
            callback([]);
        };
    }

    deleteDB(); // 最初にデータベースを削除
});
