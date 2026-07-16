const DEFAULT_FORMAT = {
  beforeUser: "+++\n",
  afterUser: "",
  beforeAssistant: "",
  afterAssistant: "",
};

const fields = {
  beforeUser: document.getElementById("beforeUser"),
  afterUser: document.getElementById("afterUser"),
  beforeAssistant: document.getElementById("beforeAssistant"),
  afterAssistant: document.getElementById("afterAssistant"),
};

const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

function currentFormat() {
  return {
    beforeUser: fields.beforeUser.value,
    afterUser: fields.afterUser.value,
    beforeAssistant: fields.beforeAssistant.value,
    afterAssistant: fields.afterAssistant.value,
  };
}

function renderPreview() {
  const fmt = currentFormat();
  const sampleUser = "How do I center a div in CSS?";
  const sampleAssistant = "You can use flexbox:\n\n```css\n.parent { display: flex; justify-content: center; }\n```";

  const text =
    fmt.beforeUser + sampleUser + fmt.afterUser +
    "\n\n" +
    fmt.beforeAssistant + sampleAssistant + fmt.afterAssistant;

  previewEl.innerHTML = '<span class="label">Preview</span>';
  const pre = document.createElement("div");
  pre.textContent = text;
  previewEl.appendChild(pre);
}

function load() {
  chrome.storage.sync.get({ promptFormat: DEFAULT_FORMAT }, (data) => {
    const fmt = { ...DEFAULT_FORMAT, ...(data && data.promptFormat) };
    fields.beforeUser.value = fmt.beforeUser;
    fields.afterUser.value = fmt.afterUser;
    fields.beforeAssistant.value = fmt.beforeAssistant;
    fields.afterAssistant.value = fmt.afterAssistant;
    renderPreview();
  });
}

function save() {
  const fmt = currentFormat();
  chrome.storage.sync.set({ promptFormat: fmt }, () => {
    statusEl.classList.add("show");
    setTimeout(() => statusEl.classList.remove("show"), 1600);
  });
}

function reset() {
  fields.beforeUser.value = DEFAULT_FORMAT.beforeUser;
  fields.afterUser.value = DEFAULT_FORMAT.afterUser;
  fields.beforeAssistant.value = DEFAULT_FORMAT.beforeAssistant;
  fields.afterAssistant.value = DEFAULT_FORMAT.afterAssistant;
  renderPreview();
  save();
}

Object.values(fields).forEach((el) => el.addEventListener("input", renderPreview));
document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", reset);

load();
