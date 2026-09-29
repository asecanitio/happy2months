document.addEventListener("DOMContentLoaded", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ==========================================
    // 0. HELPERS
    // ==========================================
    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage penuh / diblokir */ }
        }
    };

    let toastEl = null, toastTimer = null;
    function toast(message) {
        if (!toastEl) {
            toastEl = document.createElement("div");
            toastEl.className = "toast";
            toastEl.setAttribute("role", "status");
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g,
            tag => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[tag] || tag)
        );
    }

    // ==========================================
    // 1. SUPABASE CLIENT INITIALIZATION
    // ==========================================
    const SUPABASE_URL = 'https://bhrhiitsxfwvgsgxctim.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJocmhpaXRzeGZ3dmdzZ3hjdGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzA0MzQsImV4cCI6MjEwNTIwNjQzNH0.Bg2FmcDvEj2hZzflh8sCtEmVIjkkvjIvllgtucBDpK4';

    let supabaseClient = null;
    if (typeof supabase !== "undefined") {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

// ==========================================
    // 2. MODAL PASSWORD SYSTEM
    // ==========================================
    const modal = document.getElementById("passwordModal");
    const modalInput = document.getElementById("modalPasswordInput");
    const errorMsg = document.getElementById("passwordError");
    const cancelBtn = document.getElementById("cancelPassBtn");
    const submitBtn = document.getElementById("submitPassBtn");

    let pendingTargetPage = null;
    let lastFocused = null;

    if (modal) {
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-label", "Enter passcode");
    }
    if (errorMsg) errorMsg.setAttribute("role", "alert");

    // Catatan: Kunci TIDAK disimpan ke storage agar setiap browser di-refresh,
    // surat ber-password (seperti Letter 23-25) selalu meminta kode lagi.

    function openPasswordModal(targetPage) {
        pendingTargetPage = targetPage;
        lastFocused = document.activeElement;
        modalInput.value = "";
        errorMsg.style.display = "none";
        modal.classList.add("active");
        setTimeout(() => modalInput.focus(), 100);
    }

    function closePasswordModal() {
        modal.classList.remove("active");
        if (lastFocused && lastFocused.focus) lastFocused.focus({ preventScroll: true });
    }

    function checkPassword() {
        if (!pendingTargetPage) return;
        const requiredPass = pendingTargetPage.getAttribute("data-password");

        if (modalInput.value === requiredPass) {
            const pageToOpen = pendingTargetPage;
            
            // Buka surat untuk sesi ini saja tanpa menghapus data-password
            pageToOpen.classList.add("unlocked");
            
            pendingTargetPage = null;
            modal.classList.remove("active");
            executeShowPage(pageToOpen);
        } else {
            errorMsg.style.display = "block";
            modalInput.classList.add("shake");
            setTimeout(() => modalInput.classList.remove("shake"), 500);
            modalInput.select();
        }
    }

    if (cancelBtn) cancelBtn.addEventListener("click", () => { closePasswordModal(); pendingTargetPage = null; });
    if (submitBtn) submitBtn.addEventListener("click", checkPassword);
    if (modalInput) modalInput.addEventListener("keydown", (e) => { if (e.key === "Enter") checkPassword(); });
    if (modal) modal.addEventListener("click", (e) => {
        if (e.target === modal) { closePasswordModal(); pendingTargetPage = null; }
    });

    // ==========================================
    // 3. PAGE NAVIGATION SYSTEM
    // ==========================================
    const pages = document.querySelectorAll(".page, .letter-page");
    const enterBtn = document.getElementById("enterBtn");
    const backHomeBtn = document.getElementById("backHome");
    const statusEl = document.querySelector(".telemetry-bar .value.active-red");
    const letterItems = document.querySelectorAll(".letter-item");
    const TOTAL_LETTERS = document.querySelectorAll(".letter-page").length;

    function showPage(pageId) {
        const targetPage = document.getElementById(pageId);
        if (!targetPage) return;

        const requiredPassword = targetPage.getAttribute("data-password");
        if (requiredPassword && !targetPage.classList.contains("unlocked")) {
            openPasswordModal(targetPage);
            return;
        }
        executeShowPage(targetPage);
    }

    function updateStatus(id) {
        if (!statusEl) return;
        if (id === "home") {
            statusEl.textContent = "PIT STOP ACTIVE";
        } else if (id === "indexPage") {
            statusEl.textContent = "PIT LANE OPEN";
        } else {
            const item = document.querySelector(`.letter-item[data-letter="${id}"]`);
            const lap = item ? item.dataset.category.replace("lap", "LAP ") : "";
            const num = id.replace("letter", "").padStart(2, "0");
            statusEl.textContent = lap ? `LETTER ${num}, ${lap}` : `LETTER ${num}`;
        }
    }

    function executeShowPage(targetPage) {
        const id = targetPage.id;
        const isLetter = id.startsWith("letter");

        pages.forEach((p) => p.classList.remove("active"));
        targetPage.classList.add("active");

        document.body.dataset.view = id === "home" ? "home" : id === "indexPage" ? "index" : "letter";
        updateStatus(id);

        window.scrollTo(0, 0);
        updateReadProgress();

        if (isLetter) {
            fetchComments(id);
        }
    }

// ---- Home: lampu start F1 ----
    const homeContent = document.querySelector(".home-content");
    let startLights = null;
    if (homeContent) {
        startLights = document.createElement("div");
        startLights.className = "start-lights";
        startLights.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 5; i++) {
            const pod = document.createElement("div");
            pod.className = "light-pod";
            pod.style.setProperty("--i", i);
            pod.innerHTML = "<span></span><span></span>";
            startLights.appendChild(pod);
        }
        homeContent.insertBefore(startLights, homeContent.firstChild);
    }

    let entering = false;
    if (enterBtn) {
        enterBtn.addEventListener("click", () => {
            if (entering) return;
            
            // Jika tidak ada animasi/lampu, langsung pindah halaman tanpa mengunci state
            if (!startLights || reduceMotion) { 
                showPage("indexPage"); 
                return; 
            }
            
            entering = true;
            startLights.classList.add("out"); // lights out and away we go!
            
            setTimeout(() => {
                showPage("indexPage");
                startLights.classList.remove("out");
                entering = false; // Reset state agar tombol bisa diklik lagi nanti
            }, 650);
        });
    }

    // RESET flag 'entering' setiap kali user kembali ke halaman Home
    if (backHomeBtn) {
        backHomeBtn.addEventListener("click", () => {
            entering = false; 
            if (startLights) startLights.classList.remove("out");
            showPage("home");
        });
    }

    // ---- Kanan/kiri antar surat lewat keyboard & swipe ----
    function stepLetter(dir) {
        const current = document.querySelector(".letter-page.active");
        if (!current) return;
        const n = parseInt(current.id.replace("letter", ""), 10);
        const targetId = `letter${n + dir}`;
        if (document.getElementById(targetId)) showPage(targetId);
    }

    document.addEventListener("keydown", (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (modal && modal.classList.contains("active")) {
            if (e.key === "Escape") { closePasswordModal(); pendingTargetPage = null; }
            return;
        }
        if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
        if (document.body.dataset.view !== "letter") return;

        if (e.key === "ArrowRight") stepLetter(1);
        else if (e.key === "ArrowLeft") stepLetter(-1);
        else if (e.key === "Escape") showPage("indexPage");
    });

    let touchStart = null;
    document.addEventListener("touchstart", (e) => {
        if (document.body.dataset.view !== "letter" || e.touches.length !== 1) { touchStart = null; return; }
        if (e.target.closest("textarea, input, video")) { touchStart = null; return; }
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    document.addEventListener("touchend", (e) => {
        if (!touchStart) return;
        const dx = e.changedTouches[0].clientX - touchStart.x;
        const dy = e.changedTouches[0].clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(dx) > 90 && Math.abs(dy) < 50) stepLetter(dx < 0 ? 1 : -1);
    }, { passive: true });

    // ==========================================
    // 4. LAP FILTER SYSTEM
    // ==========================================
    const filterBtns = document.querySelectorAll(".filter-btn");

    filterBtns.forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.classList.contains("active"));
        btn.addEventListener("click", () => {
            filterBtns.forEach((b) => {
                b.classList.remove("active");
                b.setAttribute("aria-pressed", "false");
            });
            btn.classList.add("active");
            btn.setAttribute("aria-pressed", "true");
            btn.scrollIntoView({ inline: "center", block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });

            const filterValue = btn.getAttribute("data-filter");
            letterItems.forEach((item) => {
                item.hidden = !(filterValue === "all" || item.getAttribute("data-category") === filterValue);
            });
        });
    });

    // ---- scroll horizontal langsung: swipe (HP), wheel & drag (desktop) ----
    const filterBar = document.querySelector(".filter-container");
    if (filterBar) {
        // wheel mouse -> geser horizontal (lepas ke scroll halaman kalau sudah di ujung)
        filterBar.addEventListener("wheel", (e) => {
            if (filterBar.scrollWidth <= filterBar.clientWidth) return;
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            const max = filterBar.scrollWidth - filterBar.clientWidth;
            if ((filterBar.scrollLeft <= 0 && e.deltaY < 0) || (filterBar.scrollLeft >= max - 1 && e.deltaY > 0)) return;
            e.preventDefault();
            filterBar.scrollLeft += e.deltaY;
        }, { passive: false });

        // drag pakai mouse
        let dragX = 0, dragLeft = 0, pressing = false, moved = false;
        filterBar.addEventListener("pointerdown", (e) => {
            if (e.pointerType !== "mouse" || e.button !== 0) return;
            pressing = true; moved = false;
            dragX = e.clientX; dragLeft = filterBar.scrollLeft;
        });
        window.addEventListener("pointermove", (e) => {
            if (!pressing) return;
            const dx = e.clientX - dragX;
            if (!moved && Math.abs(dx) > 5) { moved = true; filterBar.classList.add("dragging"); }
            if (moved) filterBar.scrollLeft = dragLeft - dx;
        });
        const endDrag = () => {
            if (!pressing) return;
            pressing = false;
            setTimeout(() => filterBar.classList.remove("dragging"), 0);
        };
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);
    }

    // ==========================================
    // 4b. KLIK SURAT, NEXT/BACK, STATUS BACA
    // ==========================================
    // buka surat dari daftar (event delegation, jalan juga waktu list di-filter)
    const letterListEl = document.querySelector(".letter-list");
    if (letterListEl) {
        letterListEl.addEventListener("click", (e) => {
            const item = e.target.closest(".letter-item");
            if (item) showPage(item.dataset.letter);
        });
    }

    // tombol back / next di dalam surat
    document.querySelectorAll(".back-index").forEach((b) => b.addEventListener("click", () => showPage("indexPage")));
    document.querySelectorAll(".next-letter").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.next)));

    // ==========================================
    // 5. PROGRESS, STATUS BACA & KUNCI
    // ==========================================
    // ---- progress scroll di dalam surat ----
    const readBar = document.createElement("div");
    readBar.className = "read-progress";
    readBar.setAttribute("aria-hidden", "true");
    document.body.appendChild(readBar);

    let scrollTicking = false;
    function updateReadProgress() {
        scrollTicking = false;
        const root = document.documentElement;
        const max = root.scrollHeight - root.clientHeight;
        const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
        readBar.style.setProperty("--p", p.toFixed(3));
    }
    window.addEventListener("scroll", () => {
        if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(updateReadProgress); }
    }, { passive: true });

    // ==========================================
    // 6. INTERACTION LETTER 05 & LETTER 15
    // ==========================================
    function makeKeyboardClickable(el, label) {
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "button");
        if (label) el.setAttribute("aria-label", label);
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
        });
    }

    // Letter 05: Mystery Box / Coupon
    const box5 = document.getElementById("mysteryBox5");
    if (box5) {
        makeKeyboardClickable(box5, "Open the gift box");
        let opened5 = false;
        box5.addEventListener("click", () => {
            if (opened5) return;
            opened5 = true;
            box5.removeAttribute("tabindex");
            box5.removeAttribute("role");
            box5.style.cursor = "default";

            const boxInner = box5.querySelector(".box-inner");
            const coupon = box5.querySelector(".coupon-media-container");
            const hint = document.getElementById("hint5");

            if (boxInner) boxInner.style.display = "none";
            if (coupon) {
                coupon.classList.remove("hidden");
                coupon.style.display = "flex";
                coupon.style.justifyContent = "center";
                coupon.style.alignItems = "center";
                coupon.style.width = "100%";
            }
            if (hint) hint.innerText = "Claim ke rc aku ya, sayang!";

            triggerConfetti();
        });
    }

    // Letter 15: Emergency Kit (tanpa confetti)
    const kitImg = document.getElementById("emergencyKitImg");
    const kitBox = document.getElementById("emergencyKitBox");
    const hint15 = document.getElementById("hint15");

    if (kitImg && kitBox) {
        makeKeyboardClickable(kitImg, "Open the emergency kit");
        kitImg.addEventListener("click", () => {
            kitImg.style.display = "none";
            if (hint15) hint15.style.display = "none";
            kitBox.classList.remove("hidden");
            kitBox.style.display = "block";
        });
    }

    function triggerConfetti() {
        if (reduceMotion || typeof confetti !== "function") return;
        confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#e10600", "#FFD400", "#ffffff"]
        });
    }

    // ==========================================
    // 7. SUPABASE & LOCAL STORAGE COMMENTS SYSTEM
    // ==========================================
    async function fetchComments(letterId) {
        const listContainer = document.getElementById(`commentList-${letterId}`);
        if (!listContainer) return;

        listContainer.innerHTML = "";

        if (supabaseClient) {
            try {
                const { data: comments, error } = await supabaseClient
                    .from("comments")
                    .select("*")
                    .eq("letter_id", letterId)
                    .order("created_at", { ascending: true });

                if (!error && comments && comments.length > 0) {
                    comments.forEach((c) => renderCommentUI(listContainer, c.user_name, c.comment_text, c.created_at));
                    return;
                }
            } catch { /* jatuh ke localStorage */ }
        }

        const localComments = store.get(`comments_${letterId}`, []);
        localComments.forEach((c) => renderCommentUI(listContainer, c.profile, c.text, c.time));
    }

    function renderCommentUI(container, userName, text, timeFormatted, scrollToNew = false) {
        const commentCard = document.createElement("div");
        const isAve = userName === "AVE";
        commentCard.className = "comment-item " + (isAve ? "from-ave" : "from-mer");

        const badgeClass = isAve ? "ave-badge" : "mer-badge";

        let formattedTime = timeFormatted;
        if (timeFormatted && !isNaN(Date.parse(timeFormatted))) {
            const dateObj = new Date(timeFormatted);
            const datePart = dateObj.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
            const timePart = dateObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
            formattedTime = `${datePart} • ${timePart}`;
        }

        commentCard.innerHTML = `
            <div class="comment-user">
                <span class="user-badge ${badgeClass}">${escapeHTML(userName || "DRIVER")}</span>
                <span class="comment-time">${escapeHTML(formattedTime || "")}</span>
            </div>
            <div class="comment-text">${escapeHTML(text)}</div>
        `;
        container.appendChild(commentCard);
        if (scrollToNew) commentCard.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    }

    window.addComment = async function (letterId) {
        const inputArea = document.getElementById(`commentInput-${letterId}`);
        const commentText = inputArea ? inputArea.value.trim() : "";
        if (!commentText) { if (inputArea) inputArea.focus(); return; }

        const selectedProfile = document.querySelector(`input[name="profile-${letterId}"]:checked`);
        const profileValue = selectedProfile ? selectedProfile.value : "MER";
        const listContainer = document.getElementById(`commentList-${letterId}`);
        const sendBtn = inputArea.closest(".comment-form").querySelector(".send-comment-btn");

        sendBtn.disabled = true;
        let savedOnline = false;

        try {
            if (supabaseClient) {
                const { data, error } = await supabaseClient
                    .from("comments")
                    .insert([{ letter_id: letterId, user_name: profileValue, comment_text: commentText }])
                    .select();

                if (!error && data && data.length > 0) {
                    renderCommentUI(listContainer, data[0].user_name, data[0].comment_text, data[0].created_at, true);
                    savedOnline = true;
                }
            }
        } catch { /* fallback di bawah */ }

        if (!savedOnline) {
            const now = new Date();
            const datePart = now.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
            const timePart = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
            const timeNow = `${datePart} • ${timePart}`;

            const storageKey = `comments_${letterId}`;
            const existing = store.get(storageKey, []);
            existing.push({ profile: profileValue, text: commentText, time: timeNow });
            store.set(storageKey, existing);

            renderCommentUI(listContainer, profileValue, commentText, timeNow, true);
        }

        toast(savedOnline ? "Radio sent" : "Offline: saved on this device only");
        sendBtn.disabled = false;
        inputArea.value = "";
        inputArea.style.height = "auto";
    };

    document.addEventListener("input", (e) => {
        if (e.target.tagName.toLowerCase() === "textarea") {
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
        }
    });

    // Ctrl/Cmd + Enter = kirim
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.id && e.target.id.startsWith("commentInput-")) {
            e.preventDefault();
            window.addComment(e.target.id.replace("commentInput-", ""));
        }
    });


    // ==========================================
    // 8. MUSIC PLAYER
    // Taruh file lagu di folder "Music/" lalu isi daftar ini.
    // ==========================================
    const PLAYLIST = [
        { title: "Ah", artist: "Nadin Amizah", src: "music/Nadin Amizah - Ah.mp3" },
        { title: "Hanya Untukmu", artist: "Ten2Five", src: "music/Ten2Five - Hanya Untukmu.mp3" },
        { title: "Berdua Saja", artist: "Payung Teduh", src: "music/Berdua Saja.mp3" }
    ];

    function buildMusicPlayer() {
        if (!PLAYLIST.length) return;

        const ICON = {
            note: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
            play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
            pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
            prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>',
            next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>'
        };

        const root = document.createElement("div");
        root.className = "music-player";
        root.innerHTML = `
            <div class="music-panel" role="region" aria-label="Music player">
                <div class="music-title"></div>
                <div class="music-artist"></div>
                <div class="music-seek">
                    <span class="music-cur">0:00</span>
                    <input type="range" class="music-range" min="0" max="100" value="0" step="0.1" aria-label="Seek">
                    <span class="music-dur">0:00</span>
                </div>
                <div class="music-controls">
                    <button type="button" class="music-prev" aria-label="Previous song">${ICON.prev}</button>
                    <button type="button" class="music-play" aria-label="Play">${ICON.play}</button>
                    <button type="button" class="music-next" aria-label="Next song">${ICON.next}</button>
                </div>
                <ul class="music-list"></ul>
            </div>
            <button type="button" class="music-fab" aria-label="Music" aria-expanded="false">
                ${ICON.note}<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
            </button>`;
        document.body.appendChild(root);

        const $ = (sel) => root.querySelector(sel);
        const fab = $(".music-fab"), playBtn = $(".music-play");
        const range = $(".music-range"), curEl = $(".music-cur"), durEl = $(".music-dur");
        const list = $(".music-list");

        const audio = new Audio();
        audio.preload = "metadata";
        let index = Math.min(Math.max(store.get("musicIndex", 0), 0), PLAYLIST.length - 1);

        const fmt = (s) => {
            if (!isFinite(s)) return "0:00";
            return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
        };

        PLAYLIST.forEach((track, i) => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = track.title;
            b.addEventListener("click", () => { load(i); play(); });
            li.appendChild(b);
            list.appendChild(li);
        });

        function load(i) {
            index = (i + PLAYLIST.length) % PLAYLIST.length;
            const t = PLAYLIST[index];
            audio.src = t.src;
            $(".music-title").textContent = t.title;
            $(".music-artist").textContent = t.artist;
            range.value = 0; curEl.textContent = "0:00"; durEl.textContent = "0:00";
            list.querySelectorAll("button").forEach((b, n) => b.classList.toggle("current", n === index));
            store.set("musicIndex", index);
            if ("mediaSession" in navigator && window.MediaMetadata) {
                navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist });
            }
        }

        function play() {
            audio.play().catch(() => toast("Lagu belum ketemu. Cek folder Music/ dan nama filenya"));
        }
        function toggle() { audio.paused ? play() : audio.pause(); }

        fab.addEventListener("click", () => {
            const open = root.classList.toggle("open");
            fab.setAttribute("aria-expanded", open);
        });
        playBtn.addEventListener("click", toggle);
        $(".music-prev").addEventListener("click", () => { load(index - 1); play(); });
        $(".music-next").addEventListener("click", () => { load(index + 1); play(); });
        range.addEventListener("input", () => {
            if (audio.duration) audio.currentTime = (range.value / 100) * audio.duration;
        });

        audio.addEventListener("play", () => {
            root.classList.add("playing");
            playBtn.innerHTML = ICON.pause; playBtn.setAttribute("aria-label", "Pause");
        });
        audio.addEventListener("pause", () => {
            root.classList.remove("playing");
            playBtn.innerHTML = ICON.play; playBtn.setAttribute("aria-label", "Play");
        });
        audio.addEventListener("loadedmetadata", () => { durEl.textContent = fmt(audio.duration); });
        audio.addEventListener("timeupdate", () => {
            curEl.textContent = fmt(audio.currentTime);
            if (audio.duration) range.value = (audio.currentTime / audio.duration) * 100;
        });
        audio.addEventListener("ended", () => { load(index + 1); play(); });

        if ("mediaSession" in navigator) {
            navigator.mediaSession.setActionHandler("play", play);
            navigator.mediaSession.setActionHandler("pause", () => audio.pause());
            navigator.mediaSession.setActionHandler("previoustrack", () => { load(index - 1); play(); });
            navigator.mediaSession.setActionHandler("nexttrack", () => { load(index + 1); play(); });
        }

        load(index);
    }
    buildMusicPlayer();

    // ==========================================
    // INIT
    // ==========================================
    document.body.dataset.view = "home";
    updateStatus("home");
});