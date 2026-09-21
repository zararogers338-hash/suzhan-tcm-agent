import { expect, test } from "bun:test"
import path from "node:path"
import { PythonTool } from "../../src/tool/notebook"
import { Instance } from "../../src/project/instance"
import { KernelRuntime } from "../../src/science/kernel/registry"
import { executionSession, fullAccessExecution, tmpdir } from "../fixture/fixture"

const python =
  process.env.OPENSCIENCE_TEST_PYTHON ??
  (process.platform === "win32" ? Bun.which("python") : (Bun.which("python3") ?? Bun.which("python")))

test.skipIf(!python)(
  "persistent Python handles CRLF frames and preserves newlines inside results",
  async () => {
    await using execution = await fullAccessExecution()
    await using tmp = await tmpdir()
    const prepare = Bun.spawn([python!, "-m", "venv", "--without-pip", path.join(tmp.path, ".venv")], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, error] = await Promise.all([prepare.exited, new Response(prepare.stderr).text()])
    if (code !== 0) throw new Error(`Could not prepare the existing Python interpreter: ${error}`)
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await executionSession()
        const identity = {
          projectID: Instance.project.id,
          sessionID: session.id,
          name: "python",
          language: "python" as const,
        }
        const tool = await PythonTool.init()
        const context = {
          sessionID: session.id,
          messageID: "message_python_framing",
          callID: "call_python_framing",
          agent: "research",
          abort: new AbortController().signal,
          messages: [],
          metadata() {},
          async ask() {},
        }
        try {
          const first = await tool.execute({ code: "sum([1, 2, 3])", timeout: 5000 }, context)
          expect(first.output.trim()).toBe("6")
          const second = await tool.execute({ code: 'print("first\\r\\nsecond")', timeout: 5000 }, context)
          expect(second.output).toContain("first\r\nsecond")
          expect(second.metadata.ok).toBe(true)
        } finally {
          await KernelRuntime.release(identity)
        }
      },
    })
  },
  30000,
)
