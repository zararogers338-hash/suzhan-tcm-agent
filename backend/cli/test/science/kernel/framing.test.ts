import { describe, expect, test } from "bun:test"
import { appendFrame } from "../../../src/science/kernel/framing"

describe("kernel transport framing", () => {
  test("normalizes Windows framing even when every CRLF pair spans pipe chunks", () => {
    const source = '__OPENSCIENCE_RESULT_START__\r\n{"ok":true,"result":"6"}\r\n__OPENSCIENCE_RESULT_END__\r\n'
    const result = [...source].reduce(appendFrame, "")
    expect(result).toBe('__OPENSCIENCE_RESULT_START__\n{"ok":true,"result":"6"}\n__OPENSCIENCE_RESULT_END__\n')
  })

  test("preserves escaped result newlines and standalone carriage returns", () => {
    const payload = JSON.stringify({ stdout: "first\r\nsecond", result: "carriage\rreturn" })
    const frame = appendFrame("", payload + "\r\n")
    expect(JSON.parse(frame)).toEqual({ stdout: "first\r\nsecond", result: "carriage\rreturn" })
    expect(appendFrame("progress\r", "next")).toBe("progress\rnext")
  })

  test("leaves LF transport unchanged", () => {
    expect(appendFrame("head\n", "result\ntail\n")).toBe("head\nresult\ntail\n")
  })
})
