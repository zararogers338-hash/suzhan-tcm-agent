import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "../../src/global"
import { Storage } from "../../src/storage/storage"

function fixture() {
  const key = [
    "publish-long-paths",
    crypto.randomUUID(),
    "project-" + "p".repeat(64),
    "session-" + "s".repeat(64),
    "run-" + "r".repeat(64),
  ]
  const target = path.join(Global.Path.data, "storage", ...key) + ".json"
  return { key, target, directory: path.dirname(target) }
}

describe("Storage atomic publication on long paths", () => {
  test("publishes and replaces complete unicode records beyond Windows MAX_PATH", async () => {
    const input = fixture()
    expect(input.target.length).toBeGreaterThan(260)
    try {
      await Storage.write(input.key, { revision: 1, text: "铁死亡证据 αβγ" })
      expect(await Storage.read<{ revision: number; text: string }>(input.key)).toEqual({
        revision: 1,
        text: "铁死亡证据 αβγ",
      })
      await Storage.write(input.key, { revision: 2, text: "第二版" })
      expect(JSON.parse(await fs.readFile(input.target, "utf8"))).toEqual({ revision: 2, text: "第二版" })
      expect((await fs.readdir(input.directory)).filter((file) => file.endsWith(".tmp"))).toEqual([])
    } finally {
      await Storage.remove(input.key)
    }
  })

  test("independent readers only observe whole records while publication replaces a file", async () => {
    const input = fixture()
    const padding = "研究数据".repeat(4096)
    await Storage.write(input.key, { revision: 0, padding })
    try {
      await Promise.all([
        (async () => {
          for (let revision = 1; revision <= 12; revision++) {
            await Storage.write(input.key, { revision, padding })
          }
        })(),
        (async () => {
          for (let index = 0; index < 60; index++) {
            const record = JSON.parse(await fs.readFile(input.target, "utf8"))
            expect(record.padding).toBe(padding)
            expect(record.revision).toBeGreaterThanOrEqual(0)
            expect(record.revision).toBeLessThanOrEqual(12)
          }
        })(),
      ])
      expect((await Storage.read<{ revision: number }>(input.key)).revision).toBe(12)
    } finally {
      await Storage.remove(input.key)
    }
  })

  test("failed replacement removes staging bytes and leaves the existing target intact", async () => {
    const input = fixture()
    await fs.mkdir(input.target, { recursive: true })
    try {
      await expect(Storage.write(input.key, { cannot: "replace a directory" })).rejects.toThrow()
      expect((await fs.stat(input.target)).isDirectory()).toBe(true)
      expect((await fs.readdir(input.directory)).filter((file) => file.endsWith(".tmp"))).toEqual([])
    } finally {
      await fs.rmdir(input.target)
    }
  })
})
