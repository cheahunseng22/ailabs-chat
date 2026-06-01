const API_BASE = "http://192.168.1.144:8000";
const API_KEY = "sk_7X3kL9mN2pQ5rT8vW1yZ4aB6cD0eF3gH5jK7lM9nP1qR3tV5wX7yZ";

export async function fetchAIResponse(message, history, onChunk) {
    const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
        },
        body: JSON.stringify({ message, history })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            if (buffer) onChunk(buffer);
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        // Flush every 3 chars minimum for speed
        if (buffer.length >= 3) {
            onChunk(buffer);
            buffer = '';
        }
    }
}