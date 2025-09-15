export const dynamic = "force-dynamic"

/**
 * Proxy GET handler for the upstream SSE tick stream. This endpoint forwards
 * the text/event-stream payload from the configured upstream and pipes it to
 * the client without buffering. It supports client aborts and returns proper
 * SSE headers.
 *
 * @param request - Next.js Request object
 * @returns A streaming Response streaming raw SSE bytes
 */
export async function GET(request: Request) {
  const upstreamUrl = "https://ticks.rvinod.com/ticks"

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    })

    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream error: ${upstream.status} ${upstream.statusText}`, { status: 502 })
    }

    const reader = upstream.body.getReader()

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const pump = async () => {
          try {
            const { done, value } = await reader.read()
            if (done) {
              controller.close()
              return
            }
            if (value) controller.enqueue(value)
            pump()
          } catch (err) {
            controller.error(err)
          }
        }
        pump()

        const abort = () => {
          try {
            reader.cancel()
          } catch {}
          controller.close()
        }
        request.signal.addEventListener("abort", abort)
      },
      cancel() {
        try {
          reader.cancel()
        } catch {}
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    })
  } catch (error) {
    return new Response(`Failed to connect to upstream: ${String(error)}`)
  }
}
