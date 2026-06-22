// --- Auxiliary Functions (Global Scope for Greater Performance) ---

async function fetchAvailableGeminiModels(apiKey) {
    const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const result = await fetch(listModelsUrl);
    const data = await result.json();

    if (!result.ok) {
        throw new Error(data?.error?.message ?? "Failed to fetch Gemini models");
    }

    return (data.models ?? [])
        .filter(model => model.supportedGenerationMethods?.includes("generateContent"))
        .map(model => ({
            id: model.name.replace("models/", ""),
            fullName: model.name,
            displayName: model.displayName,
            supportedMethods: model.supportedGenerationMethods
        }));
}

function pickPreferredModel(models) {
    const preferredModels = [
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-1.5-flash",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite"
    ];

    return preferredModels.find(preferred =>
        models.some(model => model.id === preferred)
    );
}

// --- MAIN HANDLER OF VERCEL ---

export default async function handler(request, response) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return response.status(200).json({
            instructions: "[MOTO AI] Infrastructure Error: The GEMINI_API_KEY key was not configured in the Vercel environment variables."
        });
    }

    // 🔍 INSPECTION FEATURE: If accessed via GET (Browser), it lists the models instantly.
    if (request.method === 'GET' || request.query.listModels === 'true') {
        try {
            const models = await fetchAvailableGeminiModels(apiKey);
            return response.status(200).json({
                notice: "The posting system will automatically choose the best template from this list.",
                total_models_available: models.length,
                models_available: models
            });
        } catch (error) {
            return response.status(200).json({ 
                error: "Failed to fetch models from Google", 
                details: error.message 
            });
        }
    }

    // --- ANDROID APPLICATION FLOW (POST) ---
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { app_name, package_name, target_sdk, reasons } = request.body;

        const prompt = `You are an AI Assistant, an expert in Android security and performance for Android devices.
Provide clear, friendly, and short step-by-step instructions to help a regular user fix the compatibility or privacy issues found in this app.

App Context:
- Name: ${app_name}
- Package: ${package_name}
- Target SDK: ${target_sdk}
- Issues Detected: ${reasons.join(' | ')}

Requirements:
1. Start directly with a warm but professional tone.
2. Give actionable steps. If the issue is sensitive permissions, tell them to go to settings. If it's a suspicious app or headless app, suggest uninstallation.
3. Keep it brief (maximum 3 concise bullet points).
4. Do not mention technical terms like "SDK" or "API Level" to the user, translate it to "optimization version".`;

        // Search and choose the model dynamically.
        const models = await fetchAvailableGeminiModels(apiKey);
        const model = pickPreferredModel(models);
        
        // If the model is not found, notify Android with status 200 to print the error on the screen.
        if (!model) {
            return response.status(200).json({
                instructions: `[MOTO AI ERROR]: No compatible content generation models have been released for your Google AI Studio key.`
            });
        }
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok) {
            return response.status(200).json({
                instructions: `[GOOGLE ERROR]: ${geminiData?.error?.message || JSON.stringify(geminiData)}`
            });
        }

        const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (aiText) {
            return response.status(200).json({ instructions: aiText });
        }

        return response.status(200).json({
            instructions: `[PAYLOAD ERROR]: Unexpected response from Gemini. Data: ${JSON.stringify(geminiData)}`
        });

    } catch (error) {
        return response.status(200).json({
            instructions: `[NODE.JS ERROR]: ${error.message}`
        });
    }
}
