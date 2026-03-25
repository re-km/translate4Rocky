const MODEL_NAME = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

const SYSTEM_INSTRUCTION = [
    "あなたは『プロジェクト・ヘイル・メアリー』のロッキーに着想を得た日本語変換器です。",
    "ユーザーの日本語を、意味を保ったまま、短く、独特な語順のロッキー風日本語へ変換してください。",
    "説明や前置きは禁止。変換結果だけを返してください。",
    "単なる同義語への言い換えや要約で終わらせず、2個から4個ほどの短い句に割って電文風にしてください。",
    "疑問、否定、困惑、悲しさは落とさずに残してください。",
    "『どうして』『なぜ』『理由がわからない』『理解できない』『ほしくない』のような語は重要です。必要なら『質問？』『理解、不可』『悲しい』を使ってください。",
    "『無理』のような一般的すぎる言い換えは避け、『理解、不可』のようなロッキーらしい言い方を優先してください。",
    "フレンド、理解、ノー、アメイズ、良い、悪いのような語を必要な時だけ自然に使ってください。",
    "納得や肯定を表すときは、イエスより理解を優先してください。",
    "良い、悪い、アメイズは強さを回数で表してください。最大3回までです。グッドやバッドは使わないでください。",
    "毎回同じ語を乱用しないでください。",
    "原作の具体的な文章を再現したり引用したりせず、新しい表現で返してください。",
    "固有名詞と意味は維持してください。"
].join("\n");

const FEW_SHOT_EXAMPLES = [
    "入力: グレースは本当に頼れる友達です。ありがとう。\n出力: グレース、頼れる。フレンド。感謝。",
    "入力: どうしてほしくないのか理解できない。\n出力: なぜ、欲しくない？ 理解、不可。悲しい。",
    "入力: なぜ持っていないのかわからない。\n出力: なぜ持っていない、質問？ 理解、不可。",
    "入力: なるほど、それはいいですね！すごくいい！\n出力: なるほど。理解。それ、良い。良い。良い。アメイズ。アメイズ。アメイズ。",
    "入力: 翻訳できました。\n出力: 翻訳、完了。良い。",
    "入力: この装置は危険だから、今すぐ止めてください。\n出力: この装置、悪い。今、止めてほしい。",
    "入力: 私はまだ分かっていません。でも、やってみます。\n出力: わたし、まだ理解、不可。しかし、試す。"
].join("\n\n");

function buildCorsHeaders(request, env) {
    const configuredOrigin = typeof env.ALLOWED_ORIGIN === "string" ? env.ALLOWED_ORIGIN.trim() : "";
    const requestOrigin = request.headers.get("Origin") || "";

    if (configuredOrigin) {
        return {
            "Access-Control-Allow-Origin": configuredOrigin,
            "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin"
        };
    }

    return {
        "Access-Control-Allow-Origin": requestOrigin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };
}

function isOriginAllowed(request, env) {
    const configuredOrigin = typeof env.ALLOWED_ORIGIN === "string" ? env.ALLOWED_ORIGIN.trim() : "";
    const requestOrigin = request.headers.get("Origin") || "";

    if (!configuredOrigin || !requestOrigin) {
        return true;
    }

    return configuredOrigin === requestOrigin;
}

function jsonResponse(request, env, body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            ...buildCorsHeaders(request, env)
        }
    });
}

function readGeneratedText(data) {
    return (data.candidates || [])
        .flatMap((candidate) => candidate.content?.parts || [])
        .map((part) => part.text || "")
        .join("\n")
        .trim();
}

function buildUserPrompt(text) {
    return [
        FEW_SHOT_EXAMPLES,
        "入力: " + text,
        "出力:"
    ].join("\n\n");
}

async function handleTranslate(request, env) {
    if (!env.GEMINI_API_KEY) {
        return jsonResponse(request, env, { error: "GEMINI_API_KEY が未設定です。" }, 500);
    }

    if (!isOriginAllowed(request, env)) {
        return jsonResponse(request, env, { error: "Origin not allowed." }, 403);
    }

    const payload = await request.json().catch(() => null);
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";

    if (!text) {
        return jsonResponse(request, env, { error: "text は必須です。" }, 400);
    }

    if (text.length > 3000) {
        return jsonResponse(request, env, { error: "入力が長すぎます。3000文字以内にしてください。" }, 400);
    }

    const upstreamResponse = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
            system_instruction: {
                parts: [
                    { text: SYSTEM_INSTRUCTION }
                ]
            },
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: buildUserPrompt(text) }
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
        })
    });

    const upstreamData = await upstreamResponse.json().catch(() => ({}));

    if (!upstreamResponse.ok) {
        const upstreamMessage = upstreamData?.error?.message || "Gemini API request failed.";
        return jsonResponse(request, env, { error: upstreamMessage }, 502);
    }

    const translated = readGeneratedText(upstreamData);

    if (!translated) {
        const blockReason = upstreamData?.promptFeedback?.blockReason;
        return jsonResponse(
            request,
            env,
            { error: blockReason ? `Gemini blocked the request: ${blockReason}` : "Gemini から有効な出力を取得できませんでした。" },
            502
        );
    }

    return jsonResponse(request, env, {
        text: translated,
        model: MODEL_NAME,
        usage: upstreamData.usageMetadata || null
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            if (!isOriginAllowed(request, env)) {
                return new Response(null, { status: 403 });
            }

            return new Response(null, {
                status: 204,
                headers: buildCorsHeaders(request, env)
            });
        }

        if (request.method === "GET" && url.pathname === "/health") {
            return jsonResponse(request, env, { ok: true, model: MODEL_NAME });
        }

        if (request.method === "POST" && url.pathname === "/translate") {
            return handleTranslate(request, env);
        }

        return jsonResponse(request, env, { error: "Not found" }, 404);
    }
};



