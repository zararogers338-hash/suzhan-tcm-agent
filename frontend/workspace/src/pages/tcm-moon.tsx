import { createUniqueId } from "solid-js"
import { useTcmI18n } from "./tcm-i18n"

export function TcmMoon() {
  const mask = createUniqueId()
  const { t } = useTcmI18n()
  return (
    <div class="tcm-moon" aria-hidden="true">
      <svg viewBox="0 0 470 620" preserveAspectRatio="xMidYMid slice">
        <defs><mask id={mask}><rect width="470" height="620" fill="white" /><circle cx="247" cy="287" r="85" fill="black" /></mask></defs>
        <path d="M95-40C20 112-36 246 15 407S24 549-12 660H520V-40Z" fill="#303443" />
        <path d="M125-50C16 153 73 210 42 341S9 532 118 674H414C484 450 457 273 377-30Z" fill="#afafc5" />
        <g fill="none" stroke-width=".7"><ellipse cx="237" cy="315" rx="181" ry="142" stroke="#f3f0e8" transform="rotate(-31 237 315)"/><ellipse cx="235" cy="315" rx="160" ry="203" stroke="#d0c49c" transform="rotate(26 235 315)"/><ellipse cx="238" cy="309" rx="142" ry="182" stroke="#eee9df" opacity=".4" transform="rotate(-26 238 309)"/><ellipse cx="230" cy="318" rx="121" ry="146" stroke="#eee9df" opacity=".2" /></g>
        <circle cx="204" cy="318" r="90" fill="#f7f4ed" mask={`url(#${mask})`} />
        <path d="M292 361q3 30 27 33-27 4-31 28-4-26-30-29 29-4 34-32" fill="#fbf5dd" />
        <path d="M97 443q2 12 12 14-10 2-12 12-2-10-13-12 12-2 13-14" fill="#d5c696" />
        <circle cx="150" cy="134" r="3.7" fill="#f9f3da"/><circle cx="369" cy="353" r="3" fill="#f9f3da"/><circle cx="79" cy="365" r="2.4" fill="#d7c58e"/>
        <path d="M369 96v33m-15-17h30" stroke="#d4c9ac" stroke-width=".6" />
      </svg>
      <div class="tcm-moon__title">{t("本草", "herb")} <span>&</span><br/>{t("实证", "evidence")}</div>
      <div class="tcm-moon__caption">{t("让传统智慧，与科学证据相遇。", "Where herbal knowledge meets scientific evidence.")}<small>SUZHAN · POWERED BY OPENSCIENCE</small></div>
    </div>
  )
}
