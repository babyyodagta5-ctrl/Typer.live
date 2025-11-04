// hsx-runtime.js - Combined Full Frontend HSX Runtime for Mist.hsx

// ------------------- Reactive Variable System -------------------
class ReactiveVar {
    constructor(value) {
        this.value = value;
        this.subscribers = [];
    }
    set(val) {
        this.value = val;
        this.subscribers.forEach(fn => fn(val));
    }
    get() { return this.value; }
    subscribe(fn) { this.subscribers.push(fn); }
}

// ------------------- Component System -------------------
class HSXComponent {
    constructor(name, content) {
        this.name = name;
        this.content = content;
    }
    render(selector, runtime) {
        const target = document.querySelector(selector);
        if (!target) return console.warn("Render target not found:", selector);
        target.innerHTML = this.content;

        // Bind reactive variables inside component
        runtime.bindReactivity(target);
    }
}

// ------------------- HSX Runtime -------------------
export class HSXRuntime {
    constructor() {
        this.variables = {};    // name -> value / ReactiveVar
        this.components = {};   // name -> HSXComponent
    }

    // ---------------- Variable Management ----------------
    setVariable(name, value, reactive = false) {
        if (reactive) this.variables[name] = new ReactiveVar(value);
        else this.variables[name] = value;
    }

    getVariable(name) {
        const val = this.variables[name];
        return val instanceof ReactiveVar ? val.get() : val;
    }

    // ---------------- Component Management ----------------
    defineComponent(name, content) {
        this.components[name] = new HSXComponent(name, content);
    }

    renderComponent(name, selector) {
        const comp = this.components[name];
        if (!comp) return console.warn("Component not found:", name);
        comp.render(selector, this);
    }

    bindReactivity(el) {
        const reactiveVars = Object.entries(this.variables).filter(([_, v]) => v instanceof ReactiveVar);
        reactiveVars.forEach(([name, rv]) => {
            const nodes = Array.from(el.querySelectorAll("*")).filter(n => n.innerHTML.includes(`{{${name}}}`));
            rv.subscribe(v => nodes.forEach(n => n.innerHTML = n.innerHTML.replace(`{{${name}}}`, v)));
        });
    }

    // ---------------- Media Management ----------------
    loadMedia(type, url, selector) {
        const el = document.createElement(type);
        el.src = url;
        if(type === "video" || type === "audio") el.controls = true;
        const target = document.querySelector(selector) || document.body;
        target.appendChild(el);
    }

    // ---------------- Command Execution ----------------
    async execute(cmd) {
        try {
            switch(cmd.type) {
                case "set-variable":
                    this.setVariable(cmd.name, eval(cmd.value), cmd.reactive);
                    console.log(`🔧 Set ${cmd.reactive ? "reactive " : ""}variable ${cmd.name}`);
                    break;
                case "define-component":
                    this.defineComponent(cmd.name, cmd.content);
                    console.log(`🖌 Defined component ${cmd.name}`);
                    break;
                case "render-component":
                    this.renderComponent(cmd.name, cmd.selector);
                    console.log(`🎨 Rendered component ${cmd.name} to ${cmd.selector}`);
                    break;
                case "run-async":
                    console.log(`⚡ Running async code: ${cmd.code}`);
                    await eval(`(async()=>{${cmd.code}})()`);
                    break;
                case "media-load":
                    this.loadMedia(cmd.mediaType, cmd.url, cmd.selector);
                    console.log(`🖼 Loaded ${cmd.mediaType} from ${cmd.url}`);
                    break;
                default:
                    console.warn("⚠️ Unknown runtime command:", cmd);
            }
        } catch(e) {
            console.error("❌ Error executing HSX runtime command:", cmd, e);
        }
    }
}

// ------------------- HSX Loader -------------------
export async function loadHSX(url) {
    const res = await fetch(url);
    const text = await res.text();

    // Extract <hsx>...</hsx>
    const inner = text.match(/<hsx[^>]*>([\s\S]*)<\/hsx>/i)?.[1];
    if(!inner) throw new Error("Invalid HSX file");

    const temp = document.createElement("div");
    temp.innerHTML = inner;

    const runtime = new HSXRuntime();

    // ---------------- 1️⃣ Load standard <script> modules ----------------
    temp.querySelectorAll("script").forEach(s => {
        const newScript = document.createElement("script");
        if(s.src) newScript.src = s.src;
        if(s.type) newScript.type = s.type;
        newScript.textContent = s.textContent;
        document.body.appendChild(newScript);
    });

    // ---------------- 2️⃣ Parse HSX custom statements ----------------
    const hsxLines = inner.split(/\r?\n/).map(l => l.trim());
    for(const line of hsxLines) {
        if(!line.startsWith("hsx ")) continue;
        try {
            if(line.includes("exist import correct file")) {
                const file = line.split("exist import correct file")[1].trim();
                const script = document.createElement("script");
                script.type = "module";
                script.src = file;
                document.body.appendChild(script);
                console.log(`📦 HSX: imported file module ${file}`);
            } else if(line.includes("exist import simple file")) {
                const file = line.split("exist import simple file")[1].trim();
                const script = document.createElement("script");
                script.src = file;
                document.body.appendChild(script);
                console.log(`📦 HSX: imported simple file ${file}`);
            } else if(line.includes("file import all to")) {
                const dest = line.split("file import all to")[1].trim();
                console.log(`📦 HSX: bundling all files to ${dest}`);
            } else if(line.includes("file import/make/rename")) {
                const info = line.split("file import/make/rename")[1].trim();
                console.log(`📦 HSX: rename/move ${info}`);
            } else if(line.includes("media load")) {
                const [_, type, url, selector] = line.match(/media load (\w+) from (.+) to (.+)/);
                await runtime.execute({type:"media-load", mediaType:type, url, selector});
            } else if(line.includes("run async")) {
                const code = line.split("run async")[1].trim();
                await runtime.execute({type:"run-async", code});
            } else if(line.includes("define component")) {
                const [_, name, content] = line.match(/define component (\w+) (.+)/);
                await runtime.execute({type:"define-component", name, content});
            } else if(line.includes("render component")) {
                const [_, name, selector] = line.match(/render component (\w+) to (.+)/);
                await runtime.execute({type:"render-component", name, selector});
            } else if(line.includes("set variable")) {
                const reactive = line.startsWith("hsx reactive variable");
                const [_, name, value] = line.match(/variable (\w+) = (.+)/);
                await runtime.execute({type:"set-variable", name, value, reactive});
            }
        } catch(e) {
            console.warn("⚠️ Failed to parse HSX line:", line, e);
        }
    }

    // ---------------- 3️⃣ Render media and DOM elements ----------------
    temp.querySelectorAll("img,video,canvas,div").forEach(el => document.body.appendChild(el.cloneNode(true)));

    console.log("✅ HSX runtime fully loaded:", url);
    return runtime;
}

// ------------------- Auto-load if linked via <script data-src="..."> -------------------
const current = document.currentScript?.dataset?.src;
if(current) loadHSX(current);
