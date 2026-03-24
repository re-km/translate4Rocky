const DEFAULT_CONFIG = {
    translateEndpoint: "",
    requestTimeoutMs: 30000,
    modeLabel: "GEMINI RELAY",
    directModel: "gemini-2.5-flash"
};

const LOCAL_STORAGE_KEY = "rocky-translator-gemini-api-key";
const PLACEHOLDER_OUTPUT = "待機中。Gemini接続、確認中。";
const DEFAULT_HELPER_TEXT = "入力した文章をGeminiがロッキー風に言い換えます。";
const CONFIG_HELPER_TEXT = "config.json の translateEndpoint を入れるか、この端末に APIキーを保存してください。";
const HEALTH_FAIL_TEXT = "Gemini中継APIに接続できません。URL・公開状態・CORS を確認してください。";

const SYSTEM_INSTRUCTION = [
    "あなたは『プロジェクト・ヘイル・メアリー』のロッキーに着想を得た日本語変換器です。",
    "ユーザーの日本語を、意味を保ったまま、短く、独特な語順のロッキー風日本語に変換してください。",
    "説明や前置きは禁止。変換結果だけを返してください。",
    "単なる同義語への言い換えや要約で終わらせず、2個から4個ほどの短い句に割って電文風にしてください。",
    "疑問、否定、困惑、悲しさは落とさずに残してください。",
    "『どうして』『なぜ』『理由がわからない』『理解できない』『ほしくない』のような語は重要です。必要なら『疑問？』『理解、不可』『サッド』を使ってください。",
    "『無理』のような一般的すぎる言い換えは避け、『理解、不可』のようなロッキーらしい言い方を優先してください。",
    "フレンド、理解、イエス、ノー、アメイズ、グッド、バッドのような語を必要な時だけ自然に使ってください。",
    "毎回同じ語を乱用しないでください。",
    "原作の具体的な文章を再現したり引用したりせず、新しい表現で返してください。",
    "固有名詞と意味は維持してください。"
].join("\n");

const FEW_SHOT_EXAMPLES = [
    "入力: グレースは本当に頼れる友達です。ありがとう。\n出力: グレース、頼れる。フレンド。感謝。",
    "入力: どうしてほしくないのか理解できない。\n出力: なぜ、欲しくない？ 理解、不可。サッド。",
    "入力: なぜ持っていないのかわからない。\n出力: なぜ持っていない、疑問？ 理解、不可。",
    "入力: 翻訳できました。\n出力: 翻訳、完了。グッド。",
    "入力: この装置は危険だから、今すぐ止めてください。\n出力: この装置、バッド。今、止めてほしい。",
    "入力: 私はまだ分かっていません。でも、やってみます。\n出力: わたし、まだ理解、不可。しかし、試す。"
].join("\n\n");

const statusMessages = {
    boot: { label: "BOOTING", state: "warn" },
    checking: { label: "CHECKING BACKEND", state: "warn" },
    ready: { label: "GEMINI READY", state: "ok" },
    translating: { label: "TRANSLATING", state: "warn" },
    translated: { label: "TRANSLATION COMPLETE", state: "ok" },
    copied: { label: "OUTPUT COPIED", state: "ok" },
    saved: { label: "KEY SAVED", state: "ok" },
    cleared: { label: "BUFFER CLEARED", state: "warn" },
    offline: { label: "OFFLINE", state: "warn" },
    limited: { label: "PWA LIMITED", state: "warn" },
    error: { label: "INPUT REQUIRED", state: "error" },
    config: { label: "SETUP REQUIRED", state: "error" },
    failed: { label: "GEMINI ERROR", state: "error" },
    backendDown: { label: "BACKEND UNREACHABLE", state: "error" }
};

const elements = {};
let latestOutput = "";
let runtimeConfig = { ...DEFAULT_CONFIG };
let isBusy = false;
let backendConfigured = false;
let backendHealthy = false;
let localApiKey = "";

function normalizeInput(input) {
    return input
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizeEndpoint(endpoint) {
    const value = String(endpoint || "").trim();

    if (!value) {
        return "";
    }

    if (!/^https?:\/\//i.test(value)) {
        return value;
    }

    if (/\/translate\/?$/i.test(value)) {
        return value.replace(/\/+$/g, "");
    }

    return value.replace(/\/+$/g, "") + "/translate";
}

function deriveHealthEndpoint(translateEndpoint) {
    if (!translateEndpoint) {
        return "";
    }

    return translateEndpoint.replace(/\/translate\/?$/i, "/health");
}

function buildDirectGeminiEndpoint() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${runtimeConfig.directModel}:generateContent`;
}

function buildGeminiBody(text) {
    return {
        system_instruction: {
            parts: [
                { text: SYSTEM_INSTRUCTION }
            ]
        },
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: [
                            FEW_SHOT_EXAMPLES,
                            "入力: " + text,
                            "出力:"
                        ].join("\n\n")
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 256,
            responseMimeType: "text/plain",
            thinkingConfig: {
                thinkingBudget: 0
            }
        }
    };
}

function readGeminiText(data) {
    return (data.candidates || [])
        .flatMap((candidate) => candidate.content?.parts || [])
        .map((part) => part.text || "")
        .join("\n")
        .trim();
}

function canonicalizeRockyFragment(fragment) {
    const normalized = String(fragment || "")
        .trim()
        .replace(/^[。、「」\s]+|[。、「」\s]+$/g, "")
        .replace(/理解[、 ]?(?:無理|不能|不可能)/g, "理解、不可")
        .replace(/(?:わからない|分からない|理解できない|理解出来ない|不明)/g, "理解、不可")
        .replace(/ほしくない/g, "欲しくない")
        .replace(/翻訳できました|翻訳できた|翻訳しました|翻訳した/g, "翻訳、完了");

    if (!normalized) {
        return "";
    }

    if (/理解、?不可/.test(normalized)) {
        return "理解、不可";
    }

    if (/^(?:疑問|疑問？)$/.test(normalized)) {
        return "疑問？";
    }

    if (/^(?:どうして|なぜ|なんで)$/.test(normalized)) {
        return "なぜ";
    }

    if (/^(?:欲しくない|ほしくない)$/.test(normalized)) {
        return "欲しくない";
    }

    if (/^(?:翻訳、?完了|完了)$/.test(normalized)) {
        return "翻訳、完了";
    }

    if (/^(?:グッド|よい|良い|OK|ok|オーケー)$/.test(normalized)) {
        return "グッド";
    }

    if (/^(?:サッド|悲しい|つらい|辛い)$/.test(normalized)) {
        return "サッド";
    }

    return normalized;
}

function extractWhyPhrase(sourceText) {
    const match = String(sourceText || "").match(/(?:どうして|なぜ|なんで)\s*(.+?)(?:のか)?(?:理解できない|理解出来ない|わからない|分からない|不明)/);

    if (!match) {
        return "";
    }

    const clause = String(match[1] || "")
        .replace(/[。！？!?]+$/g, "")
        .trim();

    if (!clause) {
        return "";
    }

    if (/(欲しくない|ほしくない)/.test(clause)) {
        return "なぜ、欲しくない？";
    }

    return `なぜ${clause}、疑問？`;
}

function buildSemanticFragments(sourceText) {
    const fragments = [];
    const add = (fragment) => {
        if (!fragments.includes(fragment)) {
            fragments.push(fragment);
        }
    };

    const whyPhrase = extractWhyPhrase(sourceText);
    if (whyPhrase) {
        add(whyPhrase);
    }

    if (!whyPhrase && /(欲しくない|ほしくない)/.test(sourceText)) {
        add("欲しくない");
    }

    if (!whyPhrase && /(どうして|なぜ|なんで|理由|のか)/.test(sourceText)) {
        add("疑問？");
    }

    if (/(理解できない|理解出来ない|わからない|分からない|不明)/.test(sourceText)) {
        add("理解、不可");
    }

    if (/(翻訳できました|翻訳できた|翻訳しました|翻訳した|翻訳完了|翻訳、完了)/.test(sourceText)) {
        add("翻訳、完了");
        add("グッド");
    }

    if (/(欲しくない|ほしくない|悲しい|つらい|辛い|困る|ショック|戸惑)/.test(sourceText)) {
        add("サッド");
    }

    return fragments;
}

function splitRockyFragments(text) {
    return String(text || "")
        .replace(/\n+/g, "\u3002")
        .replace(/\u3001(?=(\u7591\u554f\uff1f|\u7406\u89e3\u3001\u4e0d\u53ef|\u30b5\u30c3\u30c9|\u30d0\u30c3\u30c9|\u30b0\u30c3\u30c9|\u30a2\u30e1\u30a4\u30ba|\u30d5\u30ec\u30f3\u30c9|\u30ce\u30fc|\u30a4\u30a8\u30b9|\u6b32\u3057\u304f\u306a\u3044|\u7ffb\u8a33\u3001\u5b8c\u4e86))/g, "\u3002")
        .split(/[\u3002]+/)
        .map(canonicalizeRockyFragment)
        .filter(Boolean);
}

function normalizeComparableText(text) {
    return String(text || "")
        .replace(/[\u3002\u3001\u300c\u300d\uff01\uff1f!?\s]+/g, "")
        .trim();
}

function shouldDropModelFragment(fragment, sourceText, semanticFragments) {
    const comparableFragment = normalizeComparableText(fragment);
    const comparableSource = normalizeComparableText(sourceText);

    if (!comparableFragment) {
        return true;
    }

    if (semanticFragments.length && comparableFragment.length >= 2 && comparableSource.includes(comparableFragment)) {
        return true;
    }

    if (fragment === "\u30ce\u30fc" && semanticFragments.some((value) => /^(?:\u6b32\u3057\u304f\u306a\u3044|\u7406\u89e3\u3001\u4e0d\u53ef|\u30b5\u30c3\u30c9)$/.test(value))) {
        return true;
    }

    if (/^(?:\u304d\u306a\u3044|\u3067\u304d\u306a\u3044|\u4e0d\u53ef)$/.test(fragment) && semanticFragments.includes("\u7406\u89e3\u3001\u4e0d\u53ef")) {
        return true;
    }

    return false;
}
function formatRockyFragments(fragments) {
    return fragments.reduce((result, fragment, index) => {
        const value = String(fragment || "").trim();
        if (!value) {
            return result;
        }

        const isLast = index === fragments.length - 1;
        const endsWithQuestion = /[？?]$/.test(value);
        const endsWithPeriod = /[。．.]$/.test(value);

        if (isLast) {
            if (endsWithQuestion || endsWithPeriod) {
                return result + value;
            }
            return result + value + "。";
        }

        if (endsWithQuestion) {
            return result + value + " ";
        }

        if (endsWithPeriod) {
            return result + value;
        }

        return result + value + "。";
    }, "").trim();
}

function polishRockyOutput(sourceText, outputText) {
    const semanticFragments = buildSemanticFragments(sourceText);
    const modelFragments = splitRockyFragments(outputText);
    const merged = [...semanticFragments];

    for (const fragment of modelFragments) {
        if (shouldDropModelFragment(fragment, sourceText, semanticFragments)) {
            continue;
        }

        const alreadyCovered = merged.some((existing) => existing === fragment || existing.includes(fragment) || fragment.includes(existing));
        if (!alreadyCovered) {
            merged.push(fragment);
        }
    }

    const cleaned = merged.filter((fragment, index, list) => {
        if (fragment === "理解" && list.includes("理解、不可")) {
            return false;
        }
        if (fragment === "サッド" && list.includes("グッド")) {
            return false;
        }
        return true;
    });

    if (!cleaned.length) {
        return String(outputText || "").trim();
    }

    return formatRockyFragments(cleaned);
}

function loadLocalApiKey() {
    try {
        localApiKey = localStorage.getItem(LOCAL_STORAGE_KEY) || "";
    } catch (error) {
        localApiKey = "";
    }
}

function saveLocalApiKey(value) {
    localApiKey = String(value || "").trim();
    try {
        if (localApiKey) {
            localStorage.setItem(LOCAL_STORAGE_KEY, localApiKey);
        } else {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    } catch (error) {
        localApiKey = "";
    }
}

function hasLocalApiKey() {
    return Boolean(localApiKey);
}

function getActiveMode() {
    if (backendConfigured && backendHealthy) {
        return "backend";
    }

    if (hasLocalApiKey()) {
        return "direct";
    }

    if (backendConfigured) {
        return "backend-down";
    }

    return "unconfigured";
}

function setSystemStatus(statusKey) {
    const nextStatus = statusMessages[statusKey] || statusMessages.ready;
    elements.systemStatus.textContent = nextStatus.label;
    elements.systemStatus.dataset.state = nextStatus.state;
}

function renderResult(text, state) {
    const isPlaceholder = state === "placeholder";
    elements.outputText.textContent = text;
    elements.outputText.dataset.state = isPlaceholder ? "placeholder" : "filled";
    elements.copyButton.disabled = isPlaceholder || !latestOutput || isBusy;
}

function refreshControls() {
    const canTranslate = !isBusy && Boolean(elements.inputText.value.trim()) && (getActiveMode() === "backend" || getActiveMode() === "direct");
    elements.translateButton.disabled = !canTranslate;
    elements.clearButton.disabled = isBusy;
    elements.copyButton.disabled = isBusy || !latestOutput;
    elements.saveKeyButton.disabled = isBusy || !elements.apiKeyInput.value.trim();
    elements.clearKeyButton.disabled = isBusy || !hasLocalApiKey();
}

function updateModeBadge() {
    const activeMode = getActiveMode();

    if (activeMode === "backend") {
        elements.modeStatus.textContent = runtimeConfig.modeLabel || DEFAULT_CONFIG.modeLabel;
        return;
    }

    if (activeMode === "direct") {
        elements.modeStatus.textContent = "LOCAL API KEY";
        return;
    }

    if (activeMode === "backend-down") {
        elements.modeStatus.textContent = "BACKEND DOWN";
        return;
    }

    elements.modeStatus.textContent = "SETUP REQUIRED";
}

function setHelperText(text) {
    elements.helperText.textContent = text;
}

function updateSettingsHelper(text) {
    elements.settingsHelper.textContent = text;
}
function syncIdleState() {
    if (isBusy) {
        return;
    }

    updateModeBadge();

    if (!navigator.onLine) {
        setSystemStatus("offline");
        setHelperText("Gemini変換はオンライン時のみ利用できます。");
        refreshControls();
        return;
    }

    const activeMode = getActiveMode();

    if (activeMode === "backend") {
        setSystemStatus(latestOutput ? "translated" : "ready");
        setHelperText(latestOutput ? "コピーボタンで、そのままメッセージに貼り付けできます。" : DEFAULT_HELPER_TEXT);
        updateSettingsHelper("中継APIが有効です。必要ならこの端末用APIキーも保存できます。");
        refreshControls();
        return;
    }

    if (activeMode === "direct") {
        setSystemStatus(latestOutput ? "translated" : "ready");
        setHelperText(latestOutput ? "コピーボタンで、そのままメッセージに貼り付けできます。" : "この端末に保存した Gemini APIキーで直接変換します。");
        updateSettingsHelper("APIキーはこの端末のブラウザ保存領域にのみ保存されています。必要なら削除できます。");
        refreshControls();
        return;
    }

    if (activeMode === "backend-down") {
        setSystemStatus("backendDown");
        setHelperText(HEALTH_FAIL_TEXT);
        updateSettingsHelper(hasLocalApiKey() ? "中継APIは落ちていますが、保存済みAPIキーで直接利用できます。" : "中継APIが使えません。保存済みAPIキーがあれば直接利用に切り替えられます。");
        if (!latestOutput) {
            renderResult("Gemini中継APIに接続できません。Cloudflare Worker のデプロイ状況と config.json のURLを確認してください。", "filled");
        }
        refreshControls();
        return;
    }

    setSystemStatus("config");
    setHelperText(CONFIG_HELPER_TEXT);
    updateSettingsHelper("中継APIの URL を config.json に設定するか、この端末にGemini APIキーを保存してください。");
    if (!latestOutput) {
        renderResult("まだ接続設定がありません。README の手順で backend をデプロイするか、この端末に APIキーを保存してください。", "filled");
    }
    refreshControls();
}

async function loadConfig() {
    try {
        const response = await fetch("./config.json", { cache: "no-store" });
        if (!response.ok) {
            return;
        }

        const fileConfig = await response.json();
        runtimeConfig = { ...DEFAULT_CONFIG, ...fileConfig };
        runtimeConfig.translateEndpoint = normalizeEndpoint(runtimeConfig.translateEndpoint);
        runtimeConfig.requestTimeoutMs = Number(runtimeConfig.requestTimeoutMs) || DEFAULT_CONFIG.requestTimeoutMs;
        runtimeConfig.modeLabel = String(runtimeConfig.modeLabel || DEFAULT_CONFIG.modeLabel).trim();
        runtimeConfig.directModel = String(runtimeConfig.directModel || DEFAULT_CONFIG.directModel).trim();
        backendConfigured = Boolean(runtimeConfig.translateEndpoint);
    } catch (error) {
        runtimeConfig = { ...DEFAULT_CONFIG };
        backendConfigured = false;
        backendHealthy = false;
    }
}

async function checkBackendHealth() {
    if (!backendConfigured || !navigator.onLine) {
        backendHealthy = false;
        return false;
    }

    const healthEndpoint = deriveHealthEndpoint(runtimeConfig.translateEndpoint);
    if (!healthEndpoint) {
        backendHealthy = false;
        return false;
    }

    setSystemStatus("checking");
    setHelperText("Gemini中継APIの接続を確認しています。");

    try {
        const response = await fetch(healthEndpoint, {
            method: "GET",
            cache: "no-store"
        });
        backendHealthy = response.ok;
        return backendHealthy;
    } catch (error) {
        backendHealthy = false;
        return false;
    }
}

async function requestViaBackend(text) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), runtimeConfig.requestTimeoutMs);

    try {
        const response = await fetch(runtimeConfig.translateEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text }),
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = typeof data.error === "string" && data.error
                ? data.error
                : "Gemini変換に失敗しました。中継APIの設定を確認してください。";
            return { state: "failed", text: message };
        }

        backendHealthy = true;

        const translatedText = typeof data.text === "string" ? data.text.trim() : "";

        if (!translatedText) {
            return {
                state: "failed",
                text: "Gemini から変換結果を取得できませんでした。"
            };
        }

        return {
            state: "translated",
            text: polishRockyOutput(text, translatedText)
        };
    } catch (error) {
        backendHealthy = false;

        if (error.name === "AbortError") {
            return {
                state: "failed",
                text: "Gemini の応答がタイムアウトしました。しばらくしてから再試行してください。"
            };
        }

        return {
            state: "failed",
            text: "Gemini中継APIに接続できませんでした。URL と CORS 設定を確認してください。"
        };
    } finally {
        clearTimeout(timeoutId);
    }
}
async function requestDirectGemini(text) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), runtimeConfig.requestTimeoutMs);

    try {
        const response = await fetch(buildDirectGeminiEndpoint(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": localApiKey
            },
            body: JSON.stringify(buildGeminiBody(text)),
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = data?.error?.message || "Gemini API への直接接続に失敗しました。APIキーを確認してください。";
            return { state: "failed", text: message };
        }

        const translatedText = readGeminiText(data);

        if (!translatedText) {
            return {
                state: "failed",
                text: "Gemini から変換結果を取得できませんでした。"
            };
        }

        return {
            state: "translated",
            text: polishRockyOutput(text, translatedText)
        };
    } catch (error) {
        if (error.name === "AbortError") {
            return {
                state: "failed",
                text: "Gemini の応答がタイムアウトしました。しばらくしてから再試行してください。"
            };
        }

        return {
            state: "failed",
            text: "Gemini API へ直接接続できませんでした。APIキーと通信状態を確認してください。"
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function translateToRocky(input) {
    const normalized = normalizeInput(input);

    if (!normalized) {
        return {
            state: "error",
            text: "入力、必要。"
        };
    }

    if (!navigator.onLine) {
        return {
            state: "offline",
            text: "オフラインです。Gemini変換はオンライン時のみ利用できます。"
        };
    }

    const activeMode = getActiveMode();

    if (activeMode === "backend") {
        return requestViaBackend(normalized);
    }

    if (activeMode === "direct") {
        return requestDirectGemini(normalized);
    }

    if (activeMode === "backend-down") {
        return {
            state: "failed",
            text: "中継APIに接続できません。保存済みAPIキーがある場合は直接モードを利用できます。"
        };
    }

    return {
        state: "config",
        text: "接続設定がありません。config.json の translateEndpoint を設定するか、APIキーを保存してください。"
    };
}

async function handleTranslate() {
    if (isBusy) {
        return;
    }

    isBusy = true;
    latestOutput = "";
    renderResult("Gemini に問い合わせ中。少し待つ、フレンド。", "filled");
    setSystemStatus("translating");
    setHelperText("ロッキー風の自然な言い換えを生成しています。");
    refreshControls();

    const result = await translateToRocky(elements.inputText.value);

    isBusy = false;
    latestOutput = result.state === "translated" ? result.text : "";
    renderResult(result.text, "filled");

    if (result.state === "translated") {
        setSystemStatus("translated");
        setHelperText("コピーボタンで、そのままメッセージに貼り付けできます。");
    } else if (result.state === "config") {
        setSystemStatus("config");
        setHelperText(CONFIG_HELPER_TEXT);
    } else if (result.state === "offline") {
        setSystemStatus("offline");
        setHelperText("通信が戻ったら、もう一度変換してください。");
    } else if (result.state === "error") {
        setSystemStatus("error");
        setHelperText("入力欄に日本語を入れてから変換してください。");
    } else {
        setSystemStatus("failed");
        setHelperText("中継APIの URL・Gemini APIキー・通信状態を確認してください。");
    }

    refreshControls();
}

function handleClear() {
    if (isBusy) {
        return;
    }

    elements.inputText.value = "";
    latestOutput = "";
    renderResult(PLACEHOLDER_OUTPUT, "placeholder");
    setSystemStatus("cleared");
    syncIdleState();
    elements.inputText.focus();
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "true");
    helper.style.position = "absolute";
    helper.style.left = "-9999px";
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
}

async function handleCopy() {
    if (!latestOutput || isBusy) {
        return;
    }

    try {
        await copyText(latestOutput);
        setSystemStatus("copied");
        setHelperText("コピー完了。メッセージやメモにそのまま貼り付けできます。");
    } catch (error) {
        setSystemStatus("failed");
        setHelperText("コピーできませんでした。長押しで手動コピーしてください。");
    }
}
function handleSaveKey() {
    const value = elements.apiKeyInput.value.trim();

    if (!value) {
        updateSettingsHelper("Gemini APIキーを入力してから保存してください。");
        refreshControls();
        return;
    }

    saveLocalApiKey(value);
    elements.apiKeyInput.value = value;
    setSystemStatus("saved");
    updateSettingsHelper("APIキーをこの端末に保存しました。config.json の中継APIより後ろにある予備回線としても使えます。");
    syncIdleState();
}

function handleClearKey() {
    saveLocalApiKey("");
    elements.apiKeyInput.value = "";
    updateSettingsHelper("この端末から APIキーを削除しました。");
    syncIdleState();
}

function shouldShowInstallHint() {
    const userAgent = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/i.test(userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    return isIos && isSafari && !isStandalone;
}

function updateInstallHint() {
    elements.installHint.hidden = !shouldShowInstallHint();
}

async function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
        return;
    }

    try {
        await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
        setSystemStatus("limited");
    }
}

async function handleConnectivityChange() {
    if (navigator.onLine && backendConfigured) {
        await checkBackendHealth();
    }
    syncIdleState();
}

async function init() {
    elements.inputText = document.getElementById("inputText");
    elements.outputText = document.getElementById("outputText");
    elements.systemStatus = document.getElementById("systemStatus");
    elements.modeStatus = document.getElementById("modeStatus");
    elements.helperText = document.getElementById("helperText");
    elements.settingsHelper = document.getElementById("settingsHelper");
    elements.installHint = document.getElementById("installHint");
    elements.translateButton = document.getElementById("translateButton");
    elements.clearButton = document.getElementById("clearButton");
    elements.copyButton = document.getElementById("copyButton");
    elements.apiKeyInput = document.getElementById("apiKeyInput");
    elements.saveKeyButton = document.getElementById("saveKeyButton");
    elements.clearKeyButton = document.getElementById("clearKeyButton");

    renderResult(PLACEHOLDER_OUTPUT, "placeholder");
    setSystemStatus("boot");
    updateInstallHint();

    loadLocalApiKey();
    elements.apiKeyInput.value = localApiKey;

    elements.translateButton.addEventListener("click", handleTranslate);
    elements.clearButton.addEventListener("click", handleClear);
    elements.copyButton.addEventListener("click", handleCopy);
    elements.saveKeyButton.addEventListener("click", handleSaveKey);
    elements.clearKeyButton.addEventListener("click", handleClearKey);
    elements.inputText.addEventListener("input", refreshControls);
    elements.apiKeyInput.addEventListener("input", refreshControls);
    elements.inputText.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            handleTranslate();
        }
    });

    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);

    await loadConfig();
    await registerServiceWorker();

    if (backendConfigured && navigator.onLine) {
        await checkBackendHealth();
    }

    syncIdleState();
}

document.addEventListener("DOMContentLoaded", () => {
    init().catch(() => {
        setSystemStatus("failed");
    });
});





