export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { app_name, package_name, target_sdk, reasons } = request.body;
        
        // Captures the API key for Vercel environment variables.
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return response.status(500).json({ 
                error: "Missing configuration", 
                details: "The GEMINI_API_KEY key was not configured in Vercel." 
            });
        }

        // Prompt Engineering: Define the AI ​​persona and provide the context of the problem.
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

        // Native call to the Gemini API (No need for npm install)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const geminiData = await geminiResponse.json();
        
        // 1. Success Case
        if (geminiData && geminiData.candidates && geminiData.candidates[0]?.content?.parts?.[0]?.text) {
            const aiText = geminiData.candidates[0].content.parts[0].text;
            return response.status(200).json({ instructions: aiText });
        } 
        
        // 2. ACTIVE DIAGNOSTICS: Captures the two most common Google error scenarios.
        let motivoErro = "Unknown payload structure";
        
        if (geminiData.error) {
            // Scenario A: Invalid, expired, or space-enabled API key
            motivoErro = `Google API rejected the key. Message: ${geminiData.error.message}`;
        } else if (geminiData.candidates && geminiData.candidates[0]?.finishReason) {
            // Scenario B: The app's name or package triggered Gemini's security filter (e.g., sensitive terms).
            motivoErro = `Security filter activated. Reason: ${geminiData.candidates[0].finishReason}`;
        } else {
            // Scenario C: Raw response in case of parsing failure.
            motivoErro = JSON.stringify(geminiData);
        }

        return response.status(200).json({ 
            instructions: `[DEBUG AI] The server responded, but Gemini blocked the operation.\n\n➔ ${motivoErro}` 
        });

    } catch (error) {
        return response.status(200).json({ 
            instructions: `[DEBUG AI] Critical runtime error in Node.js:\n\n➔ ${error.message}` 
        });
    }
}
