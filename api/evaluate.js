const TWELVE_MONTHS_MS = 31536000000;
const PLAY_STORE_PACKAGENAME = "com.android.vending";

export default async function handler(request, response) {
    // Ensures that only POST requests are accepted.
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { device_context, apps_inventory } = request.body;
        const currentDisplaySdk = device_context.current_sdk_level || 35;

        // Maps and calculates the compliance report for each application.
        const reports = apps_inventory.map(app => {
            let score = 100;
            const reasons = [];

            // 1. Old Target SDK Rule
            if (app.target_sdk_version === (currentDisplaySdk - 1)) {
                // App in SDK 35 running on device 36 receives a mild optimization warning.
                score -= 10;
                reasons.push(`Not fully optimized for Android 16 features (Targets Android 15) (-10)`);
            } else if (app.target_sdk_version < (currentDisplaySdk - 1) && app.target_sdk_version >= 30) {
                // Older apps losing the default compliance window.
                score -= 25;
                reasons.push("App target SDK below the current Android version guidelines (-25)");
            }
            
            if (app.target_sdk_version < 30) {
                score -= 35;
                reasons.push("Critical legacy Target SDK (lower than Android 11) (-35)");
            }

            // 2. Abandonment Rule (12 months)
            const appAge = Date.now() - (app.last_update_time || Date.now());
            if (appAge >= TWELVE_MONTHS_MS) {
                score -= 20;
                reasons.push("App without developer updates for more than 12 months (-20)");
            }

            // 3. Origin Rule (Sideload)
            if (app.installer_package_name !== PLAY_STORE_PACKAGENAME) {
                score -= 15;
                reasons.push("Installed outside the Google Play Store (Unknown origin) (-15)");
            }

            // 4. Sensitive Permissions
            if (app.has_sensitive_permissions === true) {
                score -= 10;
                reasons.push("Requires critical system permissions (e.g., Location, Camera) (-10)");
            }

            // 5. No Launch Intent
            if (app.has_launch_intent === false) {
                score -= 20;
                reasons.push("Runs strictly in the background with no visible icon (Headless App) (-20)");
            }

            // It guarantees the minimum limit of the individual score.
            if (score < 0) score = 0;

            return {
                packageName: app.package_name,
                appName: app.app_name,
                targetSdkVersion: app.target_sdk_version,
                score: score,
                reasons: reasons
            };
        });

        reports.sort((a, b) => a.score - b.score);

        // RULE 3: Mathematical calculation of the aggregate device score
        const overallScore = reports.length > 0 
            ? Math.round(reports.reduce((acc, r) => acc + r.score, 0) / reports.length)
            : 100;

        // Returns the structured payload to the Android client.
        return response.status(200).json({
            overallScore: overallScore,
            reports: reports
        });

    } catch (error) {
        return response.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
