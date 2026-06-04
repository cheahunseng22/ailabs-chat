const API_BASE = "https://guam-worthy-describe-anne.trycloudflare.com";
const API_KEY = "sk_7X3kL9mN2pQ5rT8vW1yZ4aB6cD0eF3gH5jK7lM9nP1qR3tV5wX7yZ";

let currentController = null;

export async function fetchAIResponse(message, history, onChunk) {
    // Abort any previous request
    if (currentController) {
        currentController.abort();
    }
    
    currentController = new AbortController();
    const timeoutId = setTimeout(() => currentController.abort(), 120000);

    try {
        const response = await fetch(`${API_BASE}/chat/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY,
            },
            body: JSON.stringify({ message, history }),
            signal: currentController.signal
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) onChunk(chunk);
        }
    } catch (err) {
        if (err.name === 'AbortError') return; // silently stop
        throw err;
    } finally {
        clearTimeout(timeoutId);
        currentController = null;
    }
}

export function stopAIResponse() {
    if (currentController) {
        currentController.abort();
        currentController = null;
    }
}