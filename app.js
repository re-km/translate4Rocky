const PHRASE_RULES = [
    { pattern: /^(こんにちは|こんばんは|おはよう)[。!！]?$/u, replacement: "こんにちは。フレンド。" },
    { pattern: /^(ありがとう|感謝します|サンキュー)[。!！]?$/u, replacement: "感謝。フレンド。" },
    { pattern: /^(ごめん|ごめんなさい|すみません|申し訳ない)[。!！]?$/u, replacement: "すまない。サッド。" },
    { pattern: /^(大丈夫|問題ない)[。!！]?$/u, replacement: "問題、小さい。" },
    { pattern: /^(はい|了解|オーケー)[。!！]?$/u, replacement: "理解、完了。" },
    { pattern: /^(いいえ|だめ)[。!！]?$/u, replacement: "ノー。" }
];

const PROPER_NOUN_RULES = [
    { pattern: /宇宙の藻|アストロファージ/gu, replacement: "アストロファージ" },
    { pattern: /タウメバ|アメーバ/gu, replacement: "タウメバ" },
    { pattern: /ゼノナイト/gu, replacement: "ゼノナイト" },
    { pattern: /地球人|人類|人間たち|人間/gu, replacement: "地球人" },
    { pattern: /エリダニアン|エリド人|同族/gu, replacement: "エリド人" },
    { pattern: /グレース/gu, replacement: "グレース" },
    { pattern: /ロッキー/gu, replacement: "ロッキー" }
];

const EMOTION_RULES = [
    { pattern: /すごい|素晴らしい|最高|見事|驚異的|天才/gu, replacement: "アメイズ" },
    { pattern: /嬉しい|楽しい|幸せ|安心|うれしい/gu, replacement: "ハッピー" },
    { pattern: /悲しい|残念|つらい|辛い|落ち込む/gu, replacement: "サッド" },
    { pattern: /危険|やばい|まずい|怖い|不安/gu, replacement: "バッド" },
    { pattern: /安全|平気/gu, replacement: "グッド" }
];

const RELATION_RULES = [
    { pattern: /友達|友人|親友|仲間/gu, replacement: "フレンド" },
    { pattern: /ありがとう|感謝|サンキュー/gu, replacement: "感謝" },
    { pattern: /ごめん|ごめんなさい|すみません|申し訳/gu, replacement: "すまない" }
];

const ACTION_RULES = [
    { pattern: /分かった|わかった|わかりました|理解した|理解しました|了解/gu, replacement: "理解、完了" },
    { pattern: /わからない|分からない|わかりません|不明|未知/gu, replacement: "理解、不可" },
    { pattern: /食べます|食べる|食事|ご飯/gu, replacement: "食べる" },
    { pattern: /眠い|寝ます|寝る|眠ります|睡眠|休みます|休む/gu, replacement: "スリープ" },
    { pattern: /助けてください|助けて下さい/gu, replacement: "助けてほしい" },
    { pattern: /来てください|来て下さい/gu, replacement: "来てほしい" },
    { pattern: /必要がある|必要です/gu, replacement: "必要" },
    { pattern: /したいです|したい/gu, replacement: "希望" },
    { pattern: /できます|できる/gu, replacement: "可能" },
    { pattern: /急いで|早く/gu, replacement: "早く" }
];

const FILLER_RULES = [
    { pattern: /本当に|とても|かなり|すごく|めっちゃ/gu, replacement: "" },
    { pattern: /ちょっと|少しだけ/gu, replacement: "少し" },
    { pattern: /という|ですので/gu, replacement: "" }
];

const PROTECTED_PHRASES = [
    { raw: "理解、不可", token: "__UNDERSTAND_NO__" },
    { raw: "理解、完了", token: "__UNDERSTAND_OK__" },
    { raw: "問題、小さい", token: "__PROBLEM_SMALL__" },
    { raw: "助けてほしい", token: "__HELP_ME__" },
    { raw: "来てほしい", token: "__COME_SOON__" }
];

const PLACEHOLDER_OUTPUT = "待機中。入力どうぞ、フレンド。";

const statusMessages = {
    ready: { label: "SYSTEM READY", state: "ok" },
    translated: { label: "TRANSLATION COMPLETE", state: "ok" },
    copied: { label: "OUTPUT COPIED", state: "ok" },
    cleared: { label: "BUFFER CLEARED", state: "warn" },
    offline: { label: "OFFLINE ACTIVE", state: "warn" },
    limited: { label: "PWA LIMITED", state: "warn" },
    error: { label: "INPUT REQUIRED", state: "error" }
};

const elements = {};
let latestOutput = "";

function applyRules(text, rules) {
    return rules.reduce((value, rule) => value.replace(rule.pattern, rule.replacement), text);
}

function normalizeInput(input) {
    return input
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function splitIntoSentences(input) {
    return input
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => line.match(/[^。!?？！]+[。!?？！]*/gu) || [line]);
}

function detectSentenceMode(sentence) {
    const trimmed = sentence.trim();

    if (!trimmed) {
        return "statement";
    }

    const body = trimmed.replace(/[。!?？！]+$/g, "");

    if (/[?？]$/.test(trimmed) || /(ですか|ますか|でしょうか|なの|かな|か)$/.test(body)) {
        return "question";
    }

    if (/(ない|ません|ぬ|じゃない|ではない|できない)$/.test(body)) {
        return "negative";
    }

    return "statement";
}

function stripSentenceEnding(text, mode) {
    let result = text.replace(/[。!?？！]+$/g, "").trim();

    if (mode === "question") {
        result = result.replace(/(ですか|ますか|でしょうか|でしたか|かな|なの|か)$/gu, "");
    }

    result = result.replace(/(です|でした|である|だ)$/gu, "");
    return result.trim();
}

function normalizeRequests(text) {
    return text
        .replace(/助けてください|助けて下さい/gu, "助けてほしい")
        .replace(/来てください|来て下さい/gu, "来てほしい")
        .replace(/([一-龯ぁ-んァ-ヴー々〆ヵヶA-Za-z0-9ー]+?)してください/gu, "$1してほしい")
        .replace(/([一-龯ぁ-んァ-ヴー々〆ヵヶA-Za-z0-9ー]+?)下さい/gu, "$1してほしい");
}

function telegraphize(text) {
    return text
        .replace(/(私は|わたしは|僕は|ぼくは|俺は)/gu, "わたし、")
        .replace(/(あなたは|君は|きみは)/gu, "あなた、")
        .replace(/(だから|なので|ので|から)/gu, "。理由、")
        .replace(/(そして|それから|それで|次に)/gu, "。次、")
        .replace(/(でも|しかし|だけど|けれど|ですが)/gu, "。しかし、")
        .replace(/([一-龯ぁ-んァ-ヴー々〆ヵヶA-Za-z0-9ー]+)(は|が|を|に|へ|と|で|も)/gu, "$1、")
        .replace(/(もう)/gu, "今")
        .replace(/(まだ)/gu, "まだ")
        .replace(/(です|ます|でした|ました|である|だろう|でしょう|する)$/gu, "")
        .replace(/[,:：]/g, "、");
}

function addRockyCadence(text) {
    return text
        .replace(/(アメイズ|ハッピー|サッド|バッド|グッド)(フレンド|感謝|すまない)/gu, "$1、$2")
        .replace(/(グレース|ロッキー|地球人|エリド人)(アメイズ|ハッピー|サッド|バッド|グッド|フレンド)/gu, "$1、$2")
        .replace(/(フレンド)(感謝|すまない|アメイズ|ハッピー|サッド|バッド|グッド)/gu, "$1、$2")
        .replace(/(バッド)(?:、)?(バッド)/gu, "$1")
        .replace(/(アメイズ)(?:、)?(アメイズ)/gu, "$1")
        .replace(/(グッド)(?:、)?(グッド)/gu, "$1")
        .replace(/(理解、完了)(?:、)?(理解、完了)/gu, "$1")
        .replace(/(理解、不可)(?:、)?(理解、不可)/gu, "$1")
        .replace(/(今|今日|明日|まだ|早く)(来てほしい|助けてほしい|スリープ|理解、不可|理解、完了|必要|可能|希望)/gu, "$1、$2");
}

function protectPhrases(text) {
    return PROTECTED_PHRASES.reduce(
        (value, phrase) => value.replaceAll(phrase.raw, phrase.token),
        text
    );
}

function restorePhrases(text) {
    return PROTECTED_PHRASES.reduce(
        (value, phrase) => value.replaceAll(phrase.token, phrase.raw),
        text
    );
}

function cleanupOutput(text) {
    return text
        .replace(/[ 　]+/g, " ")
        .replace(/。+/g, "。")
        .replace(/、+/g, "、")
        .replace(/。(?=、)/g, "")
        .replace(/^、|、$/g, "")
        .replace(/^[。\s]+|[。\s]+$/g, "")
        .trim();
}

function explodeIntoRockyPhrases(text) {
    const protectedText = protectPhrases(text);
    const parts = protectedText
        .replace(/。+/g, "。")
        .split(/[。]/)
        .flatMap((part) => part.split(/[、]/))
        .map((part) => part.trim())
        .filter(Boolean);

    return restorePhrases(parts.join("。"));
}

function finalizeSentence(text, mode) {
    let result = cleanupOutput(addRockyCadence(text));

    if (!result) {
        return mode === "question" ? "質問？" : "解析、不可。";
    }

    result = cleanupOutput(explodeIntoRockyPhrases(result));

    if (mode === "question") {
        return `${result}。質問？`;
    }

    if (mode === "negative") {
        if (/(理解、不可|ノー|不可|バッド)/.test(result)) {
            return `${result}。`;
        }
        return `${result}。ノー。`;
    }

    return `${result}。`;
}

function transformSentence(sentence) {
    const trimmed = sentence.trim();

    if (!trimmed) {
        return "";
    }

    const directRule = PHRASE_RULES.find((rule) => rule.pattern.test(trimmed));

    if (directRule) {
        return directRule.replacement;
    }

    const mode = detectSentenceMode(trimmed);
    let text = stripSentenceEnding(trimmed, mode);

    text = normalizeRequests(text);
    text = applyRules(text, PROPER_NOUN_RULES);
    text = applyRules(text, EMOTION_RULES);
    text = applyRules(text, RELATION_RULES);
    text = applyRules(text, ACTION_RULES);
    text = applyRules(text, FILLER_RULES);
    text = telegraphize(text);

    return finalizeSentence(text, mode);
}

function translateToRocky(input) {
    const normalized = normalizeInput(input);

    if (!normalized) {
        return {
            state: "error",
            text: "入力、必要。"
        };
    }

    const translated = splitIntoSentences(normalized)
        .map(transformSentence)
        .filter(Boolean)
        .join("\n");

    return {
        state: "translated",
        text: translated || "解析、不可。"
    };
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
    elements.copyButton.disabled = isPlaceholder || !latestOutput;
}

function refreshControls() {
    elements.translateButton.disabled = !elements.inputText.value.trim();
    elements.copyButton.disabled = !latestOutput;
}

function handleTranslate() {
    const result = translateToRocky(elements.inputText.value);
    latestOutput = result.state === "translated" ? result.text : "";
    elements.helperText.textContent = "コピーボタンで、そのままメッセージに貼り付けできます。";
    renderResult(result.text, result.state);
    setSystemStatus(result.state);
    refreshControls();
}

function handleClear() {
    elements.inputText.value = "";
    latestOutput = "";
    elements.helperText.textContent = "コピーボタンで、そのままメッセージに貼り付けできます。";
    renderResult(PLACEHOLDER_OUTPUT, "placeholder");
    setSystemStatus("cleared");
    refreshControls();
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
    if (!latestOutput) {
        return;
    }

    try {
        await copyText(latestOutput);
        setSystemStatus("copied");
        elements.helperText.textContent = "コピー完了。メッセージやメモにそのまま貼り付けできます。";
    } catch (error) {
        setSystemStatus("limited");
        elements.helperText.textContent = "コピーできませんでした。長押しで手動コピーしてください。";
    }
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
        setSystemStatus("limited");
        return;
    }

    try {
        await navigator.serviceWorker.register("./sw.js");
        setSystemStatus(navigator.onLine ? "ready" : "offline");
    } catch (error) {
        setSystemStatus("limited");
    }
}

function handleConnectivityChange() {
    if (!navigator.onLine) {
        setSystemStatus("offline");
        return;
    }

    if (latestOutput) {
        setSystemStatus("translated");
        return;
    }

    setSystemStatus("ready");
}

function init() {
    elements.inputText = document.getElementById("inputText");
    elements.outputText = document.getElementById("outputText");
    elements.systemStatus = document.getElementById("systemStatus");
    elements.helperText = document.getElementById("helperText");
    elements.installHint = document.getElementById("installHint");
    elements.translateButton = document.getElementById("translateButton");
    elements.clearButton = document.getElementById("clearButton");
    elements.copyButton = document.getElementById("copyButton");

    renderResult(PLACEHOLDER_OUTPUT, "placeholder");
    updateInstallHint();
    refreshControls();

    elements.translateButton.addEventListener("click", handleTranslate);
    elements.clearButton.addEventListener("click", handleClear);
    elements.copyButton.addEventListener("click", handleCopy);
    elements.inputText.addEventListener("input", () => {
        if (!elements.inputText.value.trim() && !latestOutput) {
            renderResult(PLACEHOLDER_OUTPUT, "placeholder");
            setSystemStatus("ready");
        }
        refreshControls();
    });
    elements.inputText.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            handleTranslate();
        }
    });

    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);

    registerServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
