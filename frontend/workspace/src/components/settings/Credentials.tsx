import { type Component } from "solid-js"
import { CredentialServices } from "./CredentialServices"
import { PanelBody, PanelHeader, PanelScroll } from "./_shared"
import { useNativeI18n } from "@/i18n/native-i18n"

const Credentials: Component = () => {
  const n = useNativeI18n()
  return <PanelScroll>
    <PanelHeader title={n("Credentials")} description={n("Add service credentials once and make them available to the tools that need them.")} />
    <PanelBody>
      <CredentialServices category="integration" title={n("Integrations")} description={n("NVIDIA, GitHub, OpenAlex, Hugging Face, and other research services.")} custom />
    </PanelBody>
  </PanelScroll>
}

export default Credentials
