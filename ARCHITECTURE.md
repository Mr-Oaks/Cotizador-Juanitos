# Architecture

Solid lines are built and deployed. Dashed lines are **planned** (not implemented yet) and are drawn so the design leaves room for them.

## Block diagram

```mermaid
flowchart LR
  subgraph Cliente["Customer"]
    WEB["Browser<br/>landing + quote calculator"]
    MAIL["Email inbox"]
    WA["WhatsApp"]
    RCSIN["Messages app<br/>RCS rich cards"]
  end

  subgraph Vercel["Vercel"]
    STATIC["Static site<br/>index · catalogo · privacidad"]
    EQ["/api/equipos"]
    LEAD["/api/lead"]
    CHAT["/api/chat"]
    FAQ["FAQ rules<br/>lib/faq.js"]
    WIKI["Company wiki<br/>wiki/*.md"]
    WAHOOK["/api/whatsapp webhook<br/>PLANNED"]
  end

  subgraph Google["Google Workspace"]
    GAS["Apps Script web app"]
    SHEET[("Google Sheet<br/>Equipos · Leads")]
    DRIVE[("Drive<br/>maintenance photos")]
    GMAIL["Gmail<br/>confirmation emails"]
  end

  subgraph LLM["LLM provider — TO BE DEFINED"]
    OSS["Open-source model<br/>OpenAI-compatible endpoint"]
    CLAUDE["Anthropic Claude"]
  end

  WABA["WhatsApp Business Platform<br/>PLANNED"]
  RCS["RCS Business Messaging<br/>catalog carousel · PLANNED"]

  WEB --> STATIC
  WEB --> EQ --> GAS
  WEB --> LEAD --> GAS
  WEB --> CHAT
  GAS --> SHEET
  GAS --> DRIVE
  GAS --> GMAIL --> MAIL
  CHAT --> FAQ
  CHAT --> WIKI
  CHAT -.-> OSS
  CHAT -.-> CLAUDE

  WA -.-> WABA -.-> WAHOOK
  WAHOOK -.-> CHAT
  WAHOOK -.-> LEAD
  WAHOOK -.->|"catalog link / PDF"| WABA
  STATIC -.->|"/catalogo.html"| WA
  EQ -.->|"catalog rows as rich cards"| RCS
  WAHOOK -.->|"send catalog on request"| RCS
  RCS -.-> RCSIN
  RCS -.->|"SMS with catalog link if no RCS"| RCSIN
```

| Block | Status | Notes |
|---|---|---|
| Static site, `/api/equipos`, `/api/lead` | Built | No dependencies |
| Apps Script + Sheet + Drive + Gmail | Built | `apps-script/Code.gs`; selected sheet set with `SHEET_ID` |
| Chat with FAQ rules | Built | Default while `LLM_PROVIDER=none` |
| LLM provider | To be defined | Switch with env vars only; FAQ stays as fallback if the model fails |
| Shareable catalog | Built | `/catalogo.html`, filter with `?segmento=Residencial`, prints to PDF |
| RCS catalog | Planned | Rich-card carousel built from the `Equipos` tab (photo, BTU, average price, "Cotizar" button), sent when staff or the assistant decide it is needed. Requires a verified RCS business agent through an aggregator or carrier; falls back to SMS with the `/catalogo.html` link on phones without RCS |
| WhatsApp channel | Planned | Needs a Meta Business account, a verified number and approved message templates |

### WhatsApp migration path

1. **Now:** staff share the `/catalogo.html` link (or its PDF) in WhatsApp chats by hand.
2. **Next:** add `/api/whatsapp` as the webhook of the WhatsApp Business Platform (Cloud API). Incoming messages reuse the same brain as the web chat (`/api/chat` logic) and the same lead storage (`/api/lead` logic), so there is one source of truth.
3. **Later:** send the quote confirmation and the catalog as template messages, and sync the `Equipos` tab to the WhatsApp Business catalog.

## Flow diagram

```mermaid
flowchart TD
  A([Customer opens the landing page]) --> B{Chooses a module}
  B -->|Residencial| C[Enters dimensions or m³,<br/>room type, occupants]
  B -->|Industrial| D[Enters dimensions or m³,<br/>facility type, occupants, kW]
  B -->|Mantenimiento| E[Equipment type, brand and model,<br/>problem, optional photo]

  C --> F[Cooling load in BTU/h]
  D --> F
  F --> G[Three options from the Equipos tab:<br/>budget · recommended · premium]
  G --> H[Name, email, state, colonia<br/>+ accepts privacy notice]
  E --> H

  H --> I[/api/lead validates/]
  I --> J[Apps Script]
  J --> K[(Row in Leads tab)]
  J --> L[Photo saved to Drive]
  J --> M[Confirmation email to customer<br/>+ notification to sales]

  M --> N{Customer wants to continue?}
  N -->|Yes| O[On-site visit, MXN 1,000]
  O --> P{Accepts the service?}
  P -->|Yes| Q[Installation or maintenance<br/>visit fee credited · 2-year installation warranty]
  P -->|No| R([Closed: visit fee only])
  N -->|Has questions| S[Chat: Contáctanos para más dudas]

  S --> T{LLM configured?}
  T -->|No: to be defined| U[FAQ rules answer]
  T -->|Yes| V[Model answers from wiki + catalog]
  V -->|Provider error| U
  U --> N
  V --> N

  S -.->|planned| W[Same assistant on WhatsApp]
  W -.->|planned| X[Catalog link or PDF sent to the customer]
  N -.->|planned: asks for the catalog| Y{Phone supports RCS?}
  Y -.->|Yes| Z[RCS carousel with the catalog]
  Y -.->|No| X
```
