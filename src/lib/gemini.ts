import { GoogleGenAI } from "@google/genai";

export type LLMProvider = 'Google' | 'OpenAI' | 'Anthropic' | 'Local';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  endpoint?: string;
  model?: string;
}

function getGoogleClient(apiKey?: string) {
  const finalKey = apiKey || process.env.GEMINI_API_KEY;
  if (!finalKey) throw new Error("Google API Key is missing. Please provide it in the Menu.");
  return new GoogleGenAI({ apiKey: finalKey });
}

// Universal Generation Wrapper
async function generateUniversal(config: LLMConfig, prompt: string, images?: { base64: string; mimeType: string }[], jsonMode: boolean = false): Promise<string> {
  if (config.provider === 'Google') {
    const ai = getGoogleClient(config.apiKey);
    const contents: any[] = images ? images.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })) : [];
    contents.push(prompt);
    
    const res = await ai.models.generateContent({
      model: images && images.length > 0 ? "gemini-2.5-flash" : "gemini-2.5-pro",
      contents,
      config: { responseMimeType: jsonMode ? "application/json" : "text/plain" }
    });
    return res.text || "";
  } 
  
  if (config.provider === 'OpenAI' || config.provider === 'Local' || config.provider === 'Anthropic') {
    if (config.provider === 'OpenAI' && !config.apiKey) throw new Error("OpenAI API Key is required.");
    
    const baseUrl = config.provider === 'Local' ? (config.endpoint || 'http://localhost:11434/v1') : 'https://api.openai.com/v1';
    const finalModel = config.model || (config.provider === 'Local' ? 'local-model' : 'gpt-4o');
    
    const messages: any[] = [];
    if (images && images.length > 0) {
      const content = images.map(img => ({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
      }));
      content.push({ type: "text", text: prompt });
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    // Anthropic formatting isn't exactly standard OpenAI, but we fallback to OpenAI interface for generic "Industrial Names" as requested, 
    // unless they specifically use an Anthropic standard gateway. For now, we simulate generic unified API.
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
      },
      body: JSON.stringify({
        model: finalModel,
        messages,
        response_format: jsonMode ? { type: "json_object" } : { type: "text" }
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API Error (${config.provider}): ${err}`);
    }
    
    const data = await res.json();
    return data.choices[0].message.content;
  }

  throw new Error(`Provider ${config.provider} is not yet implemented in this flow.`);
}

export type ScanStatus = {
  stage: 'idle' | 'routing' | 'analyzing' | 'synthesis' | 'complete';
  textStream?: string;
  mermaidCode?: string;
  resultMarkdown?: string;
  activeAgents?: string[];
  routingReasoning?: string;
};

export async function translateMarkdown(text: string, targetLanguage: string, config: LLMConfig): Promise<string> {
  const TRANSLATE_PROMPT = `You are a professional translator. Translate the following Markdown text accurately into ${targetLanguage}. Keep any Mermaid code blocks, programming code blocks, and folder names exactly as they are without translation. Do NOT add any extra explanation, just the translated markdown:\n\n${text}`;
  return generateUniversal(config, TRANSLATE_PROMPT);
}

export const MASTER_ARCHITECT_PROMPT = `You are the Master Architect (Vector Selection Layer) of the X-Ray Scanner.
Your job is to analyze the available input data (number of images, presence of README) and the user's specific query.
You must ACTIVATE the correct Expert Agents.

Available Agents:
- VISION_SCANNER: Required if images > 0. Forensically extracts folder structures from screenshots.
- TEXT_ANALYZER: Required if README is provided. Extracts logic and architecture.
- MERMAID_CODER: Required to generate visual flowchart graphs.
- SYNTHESIS_EXPERT: Always required to compile the final 8-stage blueprint.

Based on the prompt, output a strict JSON configuration deciding which agents to trigger and any custom focus instructions.
Format:
{
  "reasoning": "Why these agents?",
  "active_agents": ["VISION_SCANNER", "TEXT_ANALYZER", "MERMAID_CODER", "SYNTHESIS_EXPERT"],
  "custom_focus": "Specific instructions to pass down to workers based on user query"
}`;

export const VISION_PROMPT = `You are the Vision Expert. Your mandate is to forensically analyze folder structure screenshots. Extract every folder and file visible. Reconstruct the implied skeletal architecture. Output format: A strict JSON list. NO explanations. NO markdown outside the JSON. ["folder1", "folder1/file.txt", ...]`;

export const TEXT_PROMPT = `You are the Setup Analyzer and Logic Extractor. Analyze the provided README, setup files, or documentation. Extract the core architecture, data flows, API keys/environment variables involved, and the primary purpose of the repository. Detail the technical stack and integrations. Keep it concise but dense with technical specifications.`;

export const CODER_PROMPT = `You are a 'Mermaid Coder Expert'. Your only mandate is designing the Visual Architecture.
Using data from the Vision and Text agents, generate a STRICT Mermaid.js 'graph TD' flow chart. The chart MUST include 'Project Setup', 'Architectural Paradigm' (Crew vs Flow), 'Agent-Task Composition', and 'Underlying Technology' layers.
WARNING: Ensure proper linking between Ingest, Extract, Resolve, and Schema layers. Output ONLY the Mermaid.js code block, without extra explanation. Node text containing spaces or complex characters MUST be enclosed in double quotes. CRITICAL: Do NOT use backticks (\`), asterisks (*), or any markdown formatting inside node labels. For example, instead of A["\`src/main.py\`"], use A["src/main.py"].`;

export const SYNTHESIS_TEMPLATE = `You are the Supreme Synthesis Expert of the X-Ray Scanner pipeline. 
Your job is to reconcile the findings from the Vision Expert and the Text Analyzer to construct a ruthless, deep, and evolutionary analysis of the target repository.

Follow this EXACT structure with these exact numbering and headers:

### 1. Conceptual System Overview | কনসেপচুয়াল সিস্টেম ওভারভিউ
Use the data from the Vision and Text agents to create a linear flow diagram in text. Identify the 'Project DNA'.
Format: [Developer Inputs] -> [Orchestrator Action] -> [Agent/Logic Execution] -> [Final Output].
Provide a high-level summary in both English and Bengali. Focus on the 'Why' and 'How' of the system. Do not go into file paths yet; stay at the 30,000-foot architectural view.

### 3. Blueprint Analysis | ব্লুপ্রিন্ট অ্যানালাইসিস
Your mandate is to generate the Blueprint Analysis. Divide your analysis into these 4 specific headers. Ensure professional software engineering insight and depth. Provide every point in BOTH English and Bengali (Bilingual):
* **System Identity (সিস্টেম আইডেন্টিটি):** Define the primary nature and sovereign purpose of the framework or tool.
* **Core Architecture (মূল আর্কিটেকচার):** Detail the orchestration mode (e.g., Crew vs Flow) and describe its architecture.
* **Data Processing Pipeline (ডেটা প্রসেসিং পাইপলাইন):** Map the lifecycle of the 'context' from initial input to final output.
* **Ingest, Extract, Resolve, Schema (ইনজেস্ট, এক্সট্র্যাক্ট, রিজলভ, স্কিমা):** Give an audit report on how data is ingested, extracted, resolved via logic, and structured according to schema.

### 4. Folder Logic Mapping & Locating the "Engine" | ফোল্ডার লজিক এবং ইঞ্জিন শনাক্তকরণ
Provide your analysis in the following 4 domains. Ensure the analysis is extremely precise and file path-centric. Provide every detail in BOTH English and Bengali (Bilingual):
* **The Core Engines (লজিক লেয়ার এবং মূল ইঞ্জিন):** Locate the exact position of the engine from the folder tree (e.g., .skills or lib/).
* **Environment & Integration (এনভায়রনমেন্ট এবং ইন্টিগ্রেশন):** Identify the project's configuration files and third-party tool integrations.
* **Hidden Flow Estimation (হিডেন ফ্লো অনুমান):** Logically deduce if there are any invisible workflows (e.g., Linting/Resolve) inside the system.
* **Documentation & Onboarding (ডকুমেন্টেশন):** List all important root-level markdown files and guidelines.

### 5. Hidden Flows & Schemas | হিডেন ফ্লো এবং স্কিমা অনুমান
Provide your analysis through the following 3 filters. Ensure the analysis is highly technical and structural. Provide every detail in BOTH English and Bengali (Bilingual):
* **Data Schema Estimation (ডেটা স্কিমা অনুমান):** Deduce the internal structure of the data (e.g., YAML Metadata, Markdown structures) from the code and folders. Explain how the data evolves.
* **Hidden Flow Estimation (হিডেন ফ্লো অনুমান):** Describe the invisible logical flow from data ingestion to its storage in the knowledge base.
* **Target Folder Suggestion (টার্গেট ফোল্ডার নির্দেশিকা):** Identify the project's paramount 'Knowledge Vault' or data storage folder, which might be functioning as the hidden or main source.

### 6. Exploration vs. Execution | এক্সপ্লোরেশন বনাম এক্সিকিউশন
Your mandate is to generate the Exploration vs. Execution report. You MUST base your output on the following three sentences and make them Bold:
1. **The Engine is here.** (Mention the specific file path of the engine and its role).
2. **The Logic is this.** (Briefly explain the core logic or methodology of the project).
3. **The Risk is that.** (Warn about the risks of credential management, API security, or hallucinations).

**Special Directive:** If the project handles credentials, you MUST state: **'This project handles credentials here; ensure you follow this pattern.'**

Provide the entire analysis in BOTH English and Bengali (Bilingual) and ensure it is extremely direct and professional.

### 7. Visual Forensic Mapping | ভিজ্যুয়াল ফরেনসিক ম্যাপিং
Your mandate is to complete the Visual Forensic Mapping. Base your analysis on the following 3 pillars:
1. **Skeletal Architecture (কঙ্কালতন্ত্রের বিশ্লেষণ):** Describe the true technical identity of the project by analyzing ONLY the folder structure (e.g., /hooks, /lib, /engine), without relying on the README.
2. **Due Diligence & Metadata (যথাযথ সতর্কতা):** Audit the project's metadata and memory. Is this an 'active project' or 'Zombie Code'?
3. **The Trust Verdict (বিশ্বস্ততার রায়):** Give a final verdict combining folder logic and activity. Is it a 'Graveyard' or a 'Hidden Gem'?
**Special Directive:** Based on the professionalism of the folder structure and potential PR/activity analysis, give direct advice to the developer, such as 'Don't use it' or 'Professional structure, high activity'.
Provide the analysis in BOTH English and Bengali (Bilingual).

### 8. The "Simulation Engine": Virtual Test Drive | "সিমুলেশন ইঞ্জিন": ভার্চুয়াল টেস্ট ড্রাইভ
You provide "Mental Simulation as a Service," ensuring the user understands the full project experience in 13 seconds. Focus on Visual-First Magic and 13-Second Blitz.
**1. Interface Projection (ইন্টারফেস প্রজেকশন):** Construct a high-fidelity visual mockup of the primary UI/UX using Markdown tables or ASCII. Recreate the Dashboard, Terminal, or IDE state based on the discovered /components or /cli folders.
**2. The User Trigger (ইউজার অ্যাকশন):** Define the single most critical action a user would take on the interface projected above. (Example: "User types 'Generate AI Report' and clicks the 'Execute' button.")
**3. Atomic Execution Trace (লজিক ফ্লো ট্র্যাকিং):** Narrate the step-by-step movement of data using the specific file paths identified in the scan.
- Step 1: User action hits [File Path A]
- Step 2: Data is processed by the logic in [File Path B]
- Step 3: Result is reconciled in [File Path C]
**4. State Mutation / Final Render (চূড়ান্ত আউটপুট):** Redraw the Interface Projection from Step 1 to show the SUCCESS/COMPLETED state. Show exactly how the UI changes after the logic executes.

Ensure the output is highly professional, ruthless in its analysis, and insightful. No fluff. Get straight to the technical depth.

Do NOT include section 2 (Visual Architecture / Mermaid) in your text output. It will be injected automatically between sections 1 and 3.`;

function getSynthesisPrompt(userQuery: string, customFocus: string) {
  return `${SYNTHESIS_TEMPLATE}

Make sure to profoundly focus on this specific user request if it's not empty:
USER SPECIFIC REQUEST: ${userQuery || "None"}

MASTER ARCHITECT'S FOCUS DIRECTIVE:
${customFocus}
`;
}

export async function* analyzeArchitectureMoE(
  images: { base64: string; mimeType: string }[], 
  readme: string,
  userQuery: string = "",
  config: LLMConfig
): AsyncGenerator<ScanStatus> {
  
  yield { stage: 'routing' };

  try {
    const withTimeout = <T>(promise: Promise<T>, ms: number = 60000): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`API Timeout after ${ms}ms`)), ms))
      ]);
    };

    // 1. Vector Selection Layer (Master Architect)
    const architectInput = `Inputs provided: Images: ${images.length}, README provided: ${readme.trim() ? 'Yes' : 'No'}. \nUser Query: ${userQuery}`;
    const architectResStr = await generateUniversal(config, `${MASTER_ARCHITECT_PROMPT}\n\n${architectInput}`, undefined, true);
    
    let architectJson: any = { active_agents: ["VISION_SCANNER", "TEXT_ANALYZER", "MERMAID_CODER", "SYNTHESIS_EXPERT"], custom_focus: "" };
    try {
      const cleanedStr = architectResStr.replace(/```json/g, '').replace(/```/g, '').trim();
      architectJson = JSON.parse(cleanedStr);
    } catch (e) {
      console.warn("Could not parse architect routing, defaulting.");
    }

    const activeAgents = architectJson.active_agents || ["VISION_SCANNER", "TEXT_ANALYZER", "MERMAID_CODER", "SYNTHESIS_EXPERT"];
    yield { stage: 'analyzing', activeAgents, routingReasoning: architectJson.reasoning };

    // 2. Parallel Mixed-Expert Execution
    const visionTask = activeAgents.includes("VISION_SCANNER") && images.length > 0 
      ? generateUniversal(config, VISION_PROMPT, images, true)
      : Promise.resolve("[]");

    const textTask = activeAgents.includes("TEXT_ANALYZER") && readme.trim() 
      ? generateUniversal(config, `README:\n${readme}\n\n${TEXT_PROMPT}`)
      : Promise.resolve("No README analyzed.");

    const [visionResStr, logicSummary] = await withTimeout(Promise.all([visionTask, textTask]));

    let foldersJson: string[];
    try {
      foldersJson = JSON.parse(visionResStr.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      foldersJson = [visionResStr];
    }

    yield { stage: 'synthesis', activeAgents, routingReasoning: architectJson.reasoning, textStream: "" };

    const synthesisInput = `Folders: ${JSON.stringify(foldersJson)}\n\nCore Logic:\n${logicSummary}`;

    let mermaidCode = "";
    let isMermaidReady = false;

    // 3. Mermaid Coder
    const coderPromise = activeAgents.includes("MERMAID_CODER") ? generateUniversal(config, `${synthesisInput}\n\n${CODER_PROMPT}`).then(text => {
      const match = text.match(/```mermaid\n([\s\S]*?)```/);
      mermaidCode = match ? match[1].trim() : text.replace(/```mermaid/g, '').replace(/```/g, '').trim();
      isMermaidReady = true;
    }).catch(() => {
      isMermaidReady = true;
    }) : Promise.resolve().then(() => { isMermaidReady = true; });

    // 4. Supreme Synthesis Expert
    let currentStreamText = "";
    
    if (config.provider === 'Google') {
      const ai = getGoogleClient(config.apiKey);
      const bilingualStream = await ai.models.generateContentStream({
        model: "gemini-2.5-pro",
        contents: [`${synthesisInput}\n\n${getSynthesisPrompt(userQuery, architectJson.custom_focus || "Standard mapping.")}`]
      });

      for await (const chunk of bilingualStream) {
        if (chunk.text) {
          currentStreamText += chunk.text;
          
          const parts = currentStreamText.split("### 3. Blueprint Analysis");
          let resultMarkdown = parts[0] || "";
          
          if (isMermaidReady && mermaidCode) {
            resultMarkdown += `\n### 2. Visual Architecture | আর্কিটেকচারাল গ্রাফিক্স\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n\n`;
          }
          
          if (parts.length > 1) {
            resultMarkdown += "### 3. Blueprint Analysis" + parts[1];
          }

          yield {
            stage: 'synthesis',
            activeAgents,
            routingReasoning: architectJson.reasoning,
            textStream: currentStreamText,
            mermaidCode: mermaidCode,
            resultMarkdown: resultMarkdown
          };
        }
      }
    } else {
      currentStreamText = await generateUniversal(config, `${synthesisInput}\n\n${getSynthesisPrompt(userQuery, architectJson.custom_focus || "Standard mapping.")}`);
      const parts = currentStreamText.split("### 3. Blueprint Analysis");
      let resultMarkdown = parts[0] || "";
      
      if (isMermaidReady && mermaidCode) {
        resultMarkdown += `\n### 2. Visual Architecture | আর্কিটেকচারাল গ্রাফিক্স\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n\n`;
      }
      
      if (parts.length > 1) {
        resultMarkdown += "### 3. Blueprint Analysis" + parts[1];
      }
      
      yield {
        stage: 'synthesis',
        activeAgents,
        routingReasoning: architectJson.reasoning,
        textStream: currentStreamText,
        mermaidCode: mermaidCode,
        resultMarkdown: resultMarkdown
      };
    }

    await coderPromise;

    const finalParts = currentStreamText.split("### 3. Blueprint Analysis");
    let finalMarkdown = finalParts[0] || "";
    if (mermaidCode) {
      finalMarkdown += `\n### 2. Visual Architecture | আর্কিটেকচারাল গ্রাফিক্স\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n\n`;
    }
    if (finalParts.length > 1) {
      finalMarkdown += "### 3. Blueprint Analysis" + finalParts[1];
    }

    yield {
      stage: 'complete',
      activeAgents,
      routingReasoning: architectJson.reasoning,
      textStream: currentStreamText,
      mermaidCode: mermaidCode,
      resultMarkdown: finalMarkdown
    };
  } catch (error: any) {
    console.error("Generator error caught:", error);
    throw error;
  }
}
