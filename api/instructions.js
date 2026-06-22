export default async function handler(request, response) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return response.status(200).json({
            instructions: "[MOTO AI] Erro de Infraestrutura: A chave GEMINI_API_KEY não foi configurada nas variáveis de ambiente da Vercel."
        });
    }

    // 🔍 RECURSO DE INSPEÇÃO: Se acessar via GET (pelo seu navegador), lista os modelos na hora!
    if (request.method === 'GET' || request.query.listModels === 'true') {
        try {
            const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const result = await fetch(listModelsUrl);
            const data = await result.json();
            
            if (!result.ok) {
                return response.status(200).json({ 
                    error: "Google API Error ao listar modelos", 
                    details: data?.error?.message || data 
                });
            }

            const modelosSimplificados = data.models 
                ? data.models
                    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
                    .map(m => ({
                        id: m.name.replace("models/", ""),
                        displayName: m.displayName,
                        description: m.description
                    }))
                : [];

            return response.status(200).json({
                aviso: "Copie o ID do modelo desejado e cole na variável 'model' do bloco POST abaixo.",
                total_modelos: modelosSimplificados.length,
                modelos_disponiveis: modelosSimplificados
            });
        } catch (error) {
            return response.status(200).json({ 
                error: "Failed to fetch models from Google", 
                details: error.message 
            });
        }
    }

    // --- FLUXO DO APLICATIVO ANDROID (POST) ---
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

        // ⚠️ ID do Modelo. Se a lista do seu navegador mostrar algo diferente, mude aqui!
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
            // SOLUÇÃO: Forçamos o status 200 para o Android aceitar e exibir o erro real do Google na tela!
            return response.status(200).json({
                instructions: `[ERRO GOOGLE]: ${geminiData?.error?.message || JSON.stringify(geminiData)}`
            });
        }

        const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (aiText) {
            return response.status(200).json({ instructions: aiText });
        }

        return response.status(200).json({
            instructions: `[ERRO PAYLOAD]: Resposta inesperada do Gemini. Dados: ${JSON.stringify(geminiData)}`
        });

    } catch (error) {
        return response.status(200).json({
            instructions: `[ERRO NODE.JS]: ${error.message}`
        });
    }
}
