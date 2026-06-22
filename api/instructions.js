export default async function handler(request, response) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return response.status(500).json({
            error: "Missing configuration",
            details: "The GEMINI_API_KEY key was not configured in Vercel environment variables."
        });
    }

    // 🔍 RECURSO DE INSPECÇÃO: Se acessar via GET (Navegador/Postman), lista os modelos na hora!
    if (request.method === 'GET' || request.query.listModels === 'true') {
        try {
            const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const result = await fetch(listModelsUrl);
            const data = await result.json();
            
            // Filtra e limpa a resposta para você ver os IDs exatos dos modelos elegíveis
            const modelosSimplificados = data.models 
                ? data.models.map(m => ({
                    id: m.name.replace("models/", ""), // Remove o prefixo para ficar pronto para uso
                    supportedMethods: m.supportedGenerationMethods,
                    description: m.description
                  }))
                : data;

            return response.status(200).json({
                aviso: "Use o ID do modelo exatamente como listado abaixo na variável 'model' do seu código.",
                total_modelos: data.models ? data.models.length : 0,
                modelos_disponiveis: modelosSimplificados
            });
        } catch (error) {
            return response.status(500).json({ 
                error: "Failed to fetch models from Google", 
                details: error.message 
            });
        }
    }

    // --- DAQUI PARA BAIXO SEGUE O SEU FLUXO PADRÃO DO ANDROID (POST) ---
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { app_name, package_name, target_sdk, reasons } = request.body;

        const prompt = `You are an AI Assistant, an expert in Android security and performance for Android devices.
Provide clear, friendly, and short step-by-step instructions in Portuguese to help a regular user fix the compatibility or privacy issues found in this app.

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

        // Você está usando o gemini-2.0-flash aqui. Mude essa String se o teste do GET mostrar outro ID!
        const model = "gemini-2.0-flash"; 
        
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
            return response.status(geminiResponse.status).json({
                error: "Gemini API error",
                details: geminiData?.error?.message ?? geminiData
            });
        }

        const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (aiText) {
            return response.status(200).json({ instructions: aiText });
        }

        return response.status(502).json({
            error: "Unexpected Gemini response",
            details: geminiData
        });

    } catch (error) {
        return response.status(500).json({
            error: "Runtime error",
            details: error.message
        });
    }
}
