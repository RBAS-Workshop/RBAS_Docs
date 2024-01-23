const kObject = Symbol.for("reflexo-obj");
class PageViewport {
  constructor({ viewBox, scale, rotation, offsetX = 0, offsetY = 0, dontFlip = false }) {
    this.viewBox = viewBox;
    this.scale = scale;
    this.rotation = rotation;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    const centerX = (viewBox[2] + viewBox[0]) / 2;
    const centerY = (viewBox[3] + viewBox[1]) / 2;
    let rotateA, rotateB, rotateC, rotateD;
    rotation %= 360;
    if (rotation < 0) {
      rotation += 360;
    }
    switch (rotation) {
      case 180:
        rotateA = -1;
        rotateB = 0;
        rotateC = 0;
        rotateD = 1;
        break;
      case 90:
        rotateA = 0;
        rotateB = 1;
        rotateC = 1;
        rotateD = 0;
        break;
      case 270:
        rotateA = 0;
        rotateB = -1;
        rotateC = -1;
        rotateD = 0;
        break;
      case 0:
        rotateA = 1;
        rotateB = 0;
        rotateC = 0;
        rotateD = -1;
        break;
      default:
        throw new Error("PageViewport: Invalid rotation, must be a multiple of 90 degrees.");
    }
    if (dontFlip) {
      rotateC = -rotateC;
      rotateD = -rotateD;
    }
    let offsetCanvasX, offsetCanvasY;
    let width, height;
    if (rotateA === 0) {
      offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
      width = (viewBox[3] - viewBox[1]) * scale;
      height = (viewBox[2] - viewBox[0]) * scale;
    } else {
      offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
      width = (viewBox[2] - viewBox[0]) * scale;
      height = (viewBox[3] - viewBox[1]) * scale;
    }
    this.transform = [
      rotateA * scale,
      rotateB * scale,
      rotateC * scale,
      rotateD * scale,
      offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
      offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY
    ];
    this.width = width;
    this.height = height;
  }
  get rawDims() {
    const { viewBox } = this;
    return {
      // todo: shadow
      pageWidth: viewBox[2] - viewBox[0],
      pageHeight: viewBox[3] - viewBox[1],
      pageX: viewBox[0],
      pageY: viewBox[1]
    };
  }
  clone({ scale = this.scale, rotation = this.rotation, offsetX = this.offsetX, offsetY = this.offsetY, dontFlip = false } = {}) {
    return new PageViewport({
      viewBox: this.viewBox.slice(),
      scale,
      rotation,
      offsetX,
      offsetY,
      dontFlip
    });
  }
  static applyTransform(p, m) {
    const xt = p[0] * m[0] + p[1] * m[2] + m[4];
    const yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  }
  static applyInverseTransform(p, m) {
    const d = m[0] * m[3] - m[1] * m[2];
    const xt = (p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
    const yt = (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[5] * m[0]) / d;
    return [xt, yt];
  }
  convertToViewportPoint(x, y) {
    return PageViewport.applyTransform([x, y], this.transform);
  }
  convertToViewportRectangle(rect) {
    const topLeft = PageViewport.applyTransform([rect[0], rect[1]], this.transform);
    const bottomRight = PageViewport.applyTransform([rect[2], rect[3]], this.transform);
    return [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]];
  }
  convertToPdfPoint(x, y) {
    return PageViewport.applyInverseTransform([x, y], this.transform);
  }
}
class RenderView {
  constructor(pageInfos, container, options) {
    this.pageInfos = pageInfos;
    this.imageScaleFactor = options.pixelPerPt ?? 2;
    container.innerHTML = "";
    container.style.width = "100%";
    this.container = container;
    this.canvasList = new Array(this.loadPageCount);
    this.textLayerList = new Array(this.loadPageCount);
    this.commonList = new Array(this.loadPageCount);
    this.textLayerParentList = new Array(this.loadPageCount);
    this.annotationLayerList = new Array(this.loadPageCount);
    this.semanticLayerList = new Array(this.loadPageCount);
    const createOver = (i, width, height, commonDiv) => {
      const canvas = this.canvasList[i] = document.createElement("canvas");
      const semanticLayer = this.semanticLayerList[i] = document.createElement("div");
      const textLayer = this.textLayerList[i] = document.createElement("div");
      const textLayerParent = this.textLayerParentList[i] = document.createElement("div");
      const annotationLayer = this.annotationLayerList[i] = document.createElement("div");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const canvasDiv = document.createElement("div");
        canvas.width = width;
        canvas.height = height;
        canvasDiv.appendChild(canvas);
        commonDiv.appendChild(canvasDiv);
        canvasDiv.style.position = "absolute";
      }
      {
        textLayerParent.appendChild(textLayer);
        textLayerParent.className = "text-layer textLayer";
        const containerWidth = container.offsetWidth;
        const orignalScale = containerWidth / width;
        textLayerParent.style.width = `${containerWidth}px`;
        textLayerParent.style.height = `${height * orignalScale}px`;
        textLayerParent.style.position = "absolute";
        annotationLayer.style.width = `${containerWidth}px`;
        annotationLayer.style.height = `${height * orignalScale}px`;
        annotationLayer.style.position = "absolute";
        commonDiv.classList.add("typst-page");
        commonDiv.classList.add("canvas");
        commonDiv.style.width = `${containerWidth}px`;
        commonDiv.style.height = `${height * orignalScale}px`;
        commonDiv.style.position = "relative";
        semanticLayer.appendChild(textLayerParent);
        semanticLayer.appendChild(annotationLayer);
        commonDiv.appendChild(semanticLayer);
      }
    };
    for (let i = 0; i < this.pageInfos.length; i++) {
      const pageAst = this.pageInfos[i];
      const width = Math.ceil(pageAst.width) * this.imageScaleFactor;
      const height = Math.ceil(pageAst.height) * this.imageScaleFactor;
      let commonDiv = void 0;
      commonDiv = this.commonList[i] = document.createElement("div");
      container.appendChild(commonDiv);
      createOver(i, width, height, commonDiv);
    }
  }
  resetLayout() {
    for (let i = 0; i < this.pageInfos.length; i++) {
      const pageAst = this.pageInfos[i];
      const width = Math.ceil(pageAst.width) * this.imageScaleFactor;
      const height = Math.ceil(pageAst.height) * this.imageScaleFactor;
      const canvasDiv = this.canvasList[i].parentElement;
      if (!canvasDiv) {
        throw new Error(`canvasDiv is null for page ${i}, canvas list length ${this.canvasList.length}`);
      }
      const commonDiv = this.commonList[i];
      const textLayerParent = this.textLayerParentList[i];
      const annotationLayer = this.annotationLayerList[i];
      const containerWidth = this.container.offsetWidth;
      const orignalScale = containerWidth / width;
      textLayerParent.style.width = `${containerWidth}px`;
      textLayerParent.style.height = `${height * orignalScale}px`;
      annotationLayer.style.width = `${containerWidth}px`;
      annotationLayer.style.height = `${height * orignalScale}px`;
      commonDiv.style.width = `${containerWidth}px`;
      commonDiv.style.height = `${height * orignalScale}px`;
      const currentScale = this.container.offsetWidth / width;
      canvasDiv.style.transformOrigin = "0px 0px";
      canvasDiv.style.transform = `scale(${currentScale})`;
    }
  }
}
function renderTextLayer(pdfjsLib, container, pageInfos, layerList, textSourceList) {
  const containerWidth = container.offsetWidth;
  const t2 = performance.now();
  const renderOne = (layer, i) => {
    var _a;
    const page_info = pageInfos[i];
    if (!page_info) {
      console.error("page not found for", i);
      return;
    }
    const width_pt = page_info.width;
    const height_pt = page_info.height;
    const orignalScale = containerWidth / width_pt;
    const scale = Number.parseFloat(orignalScale.toFixed(4));
    (_a = layer.parentElement) == null ? void 0 : _a.style.setProperty("--scale-factor", scale.toString());
    const viewport = new PageViewport({
      viewBox: [0, 0, width_pt, height_pt],
      scale,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      dontFlip: false
    });
    pdfjsLib.renderTextLayer({
      textContentSource: textSourceList[i],
      container: layer,
      viewport
    });
  };
  layerList.forEach(renderOne);
  const t3 = performance.now();
  console.log(`text layer used: render = ${(t3 - t2).toFixed(1)}ms`);
}
const once = (fn) => {
  let called = false;
  let res;
  return () => {
    if (called) {
      return res;
    }
    called = true;
    return res = fn();
  };
};
class LazyWasmModule {
  constructor(initFn) {
    if (typeof initFn !== "function") {
      throw new Error("initFn is not a function");
    }
    this.initOnce = once(async () => {
      await initFn(this.wasmBin);
    });
  }
  async init(module) {
    this.wasmBin = module;
    await this.initOnce();
  }
}
const instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
let idbProxyableTypes;
let cursorAdvanceMethods;
function getIdbProxyableTypes() {
  return idbProxyableTypes || (idbProxyableTypes = [
    IDBDatabase,
    IDBObjectStore,
    IDBIndex,
    IDBCursor,
    IDBTransaction
  ]);
}
function getCursorAdvanceMethods() {
  return cursorAdvanceMethods || (cursorAdvanceMethods = [
    IDBCursor.prototype.advance,
    IDBCursor.prototype.continue,
    IDBCursor.prototype.continuePrimaryKey
  ]);
}
const cursorRequestMap = /* @__PURE__ */ new WeakMap();
const transactionDoneMap = /* @__PURE__ */ new WeakMap();
const transactionStoreNamesMap = /* @__PURE__ */ new WeakMap();
const transformCache = /* @__PURE__ */ new WeakMap();
const reverseTransformCache = /* @__PURE__ */ new WeakMap();
function promisifyRequest(request) {
  const promise = new Promise((resolve, reject) => {
    const unlisten = () => {
      request.removeEventListener("success", success);
      request.removeEventListener("error", error);
    };
    const success = () => {
      resolve(wrap(request.result));
      unlisten();
    };
    const error = () => {
      reject(request.error);
      unlisten();
    };
    request.addEventListener("success", success);
    request.addEventListener("error", error);
  });
  promise.then((value) => {
    if (value instanceof IDBCursor) {
      cursorRequestMap.set(value, request);
    }
  }).catch(() => {
  });
  reverseTransformCache.set(promise, request);
  return promise;
}
function cacheDonePromiseForTransaction(tx) {
  if (transactionDoneMap.has(tx))
    return;
  const done = new Promise((resolve, reject) => {
    const unlisten = () => {
      tx.removeEventListener("complete", complete);
      tx.removeEventListener("error", error);
      tx.removeEventListener("abort", error);
    };
    const complete = () => {
      resolve();
      unlisten();
    };
    const error = () => {
      reject(tx.error || new DOMException("AbortError", "AbortError"));
      unlisten();
    };
    tx.addEventListener("complete", complete);
    tx.addEventListener("error", error);
    tx.addEventListener("abort", error);
  });
  transactionDoneMap.set(tx, done);
}
let idbProxyTraps = {
  get(target, prop, receiver) {
    if (target instanceof IDBTransaction) {
      if (prop === "done")
        return transactionDoneMap.get(target);
      if (prop === "objectStoreNames") {
        return target.objectStoreNames || transactionStoreNamesMap.get(target);
      }
      if (prop === "store") {
        return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
      }
    }
    return wrap(target[prop]);
  },
  set(target, prop, value) {
    target[prop] = value;
    return true;
  },
  has(target, prop) {
    if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
      return true;
    }
    return prop in target;
  }
};
function replaceTraps(callback) {
  idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
  if (func === IDBDatabase.prototype.transaction && !("objectStoreNames" in IDBTransaction.prototype)) {
    return function(storeNames, ...args) {
      const tx = func.call(unwrap(this), storeNames, ...args);
      transactionStoreNamesMap.set(tx, storeNames.sort ? storeNames.sort() : [storeNames]);
      return wrap(tx);
    };
  }
  if (getCursorAdvanceMethods().includes(func)) {
    return function(...args) {
      func.apply(unwrap(this), args);
      return wrap(cursorRequestMap.get(this));
    };
  }
  return function(...args) {
    return wrap(func.apply(unwrap(this), args));
  };
}
function transformCachableValue(value) {
  if (typeof value === "function")
    return wrapFunction(value);
  if (value instanceof IDBTransaction)
    cacheDonePromiseForTransaction(value);
  if (instanceOfAny(value, getIdbProxyableTypes()))
    return new Proxy(value, idbProxyTraps);
  return value;
}
function wrap(value) {
  if (value instanceof IDBRequest)
    return promisifyRequest(value);
  if (transformCache.has(value))
    return transformCache.get(value);
  const newValue = transformCachableValue(value);
  if (newValue !== value) {
    transformCache.set(value, newValue);
    reverseTransformCache.set(newValue, value);
  }
  return newValue;
}
const unwrap = (value) => reverseTransformCache.get(value);
const readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
const writeMethods = ["put", "add", "delete", "clear"];
const cachedMethods = /* @__PURE__ */ new Map();
function getMethod(target, prop) {
  if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
    return;
  }
  if (cachedMethods.get(prop))
    return cachedMethods.get(prop);
  const targetFuncName = prop.replace(/FromIndex$/, "");
  const useIndex = prop !== targetFuncName;
  const isWrite = writeMethods.includes(targetFuncName);
  if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
  ) {
    return;
  }
  const method = async function(storeName, ...args) {
    const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
    let target2 = tx.store;
    if (useIndex)
      target2 = target2.index(args.shift());
    return (await Promise.all([
      target2[targetFuncName](...args),
      isWrite && tx.done
    ]))[0];
  };
  cachedMethods.set(prop, method);
  return method;
}
replaceTraps((oldTraps) => ({
  ...oldTraps,
  get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
  has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
}));
class ComponentBuilder {
  constructor() {
    this.loadedFonts = /* @__PURE__ */ new Set();
    this.fetcher = fetch;
  }
  setFetcher(fetcher) {
    this.fetcher = fetcher;
  }
  async loadFonts(builder, fonts) {
    const escapeImport = new Function("m", "return import(m)");
    const fetcher = this.fetcher || (this.fetcher = await async function() {
      const { fetchBuilder, FileSystemCache } = await escapeImport("node-fetch-cache");
      const cache = new FileSystemCache({
        /// By default, we don't have a complicated cache policy.
        cacheDirectory: ".cache/typst/fonts"
      });
      const cachedFetcher = fetchBuilder.withCache(cache);
      return function(input, init) {
        const timeout = setTimeout(() => {
          console.warn("font fetching is stucking:", input);
        }, 15e3);
        return cachedFetcher(input, init).finally(() => {
          clearTimeout(timeout);
        });
      };
    }());
    const fontsToLoad = fonts.filter((font) => {
      if (font instanceof Uint8Array) {
        return true;
      }
      if (this.loadedFonts.has(font)) {
        return false;
      }
      this.loadedFonts.add(font);
      return true;
    });
    const fontLists = await Promise.all(fontsToLoad.map(async (font) => {
      if (font instanceof Uint8Array) {
        await builder.add_raw_font(font);
        return;
      }
      return new Uint8Array(await (await fetcher(font)).arrayBuffer());
    }));
    for (const font of fontLists) {
      if (!font) {
        continue;
      }
      await builder.add_raw_font(font);
    }
  }
  async build(options, builder, hooks) {
    const buildCtx = { ref: this, builder, hooks };
    for (const fn of (options == null ? void 0 : options.beforeBuild) ?? []) {
      await fn(void 0, buildCtx);
    }
    if (hooks.latelyBuild) {
      hooks.latelyBuild(buildCtx);
    }
    const component = await builder.build();
    return component;
  }
}
async function buildComponent(options, gModule, Builder, hooks) {
  var _a;
  await gModule.init((_a = options == null ? void 0 : options.getModule) == null ? void 0 : _a.call(options));
  return await new ComponentBuilder().build(options, new Builder(), hooks);
}
let RenderSession$1 = class RenderSession {
  /**
   * @internal
   */
  constructor(plugin, o) {
    this.plugin = plugin;
    this[kObject] = o;
  }
  /**
   * Set the background color of the Typst document.
   * @param {string} t - The background color in format of `^#?[0-9a-f]{6}$`
   *
   * Note: Default to `#ffffff`.
   *
   * Note: Only available in canvas rendering mode.
   */
  set backgroundColor(t) {
    if (t !== void 0) {
      this[kObject].background_color = t;
    }
  }
  /**
   * Get the background color of the Typst document.
   *
   * Note: Default to `#ffffff`.
   *
   * Note: Only available in canvas rendering mode.
   */
  get backgroundColor() {
    return this[kObject].background_color;
  }
  /**
   * Set the pixel per point scale up the canvas panel.
   *
   * Note: Default to `3`.
   *
   * Note: Only available in canvas rendering mode.
   */
  set pixelPerPt(t) {
    if (t !== void 0) {
      this[kObject].pixel_per_pt = t;
    }
  }
  /**
   * Get the pixel per point scale up the canvas panel.
   *
   * Note: Default to `3`.
   *
   * Note: Only available in canvas rendering mode.
   */
  get pixelPerPt() {
    return this[kObject].pixel_per_pt;
  }
  /**
   * Reset state
   */
  reset() {
    this.plugin.resetSession(this);
  }
  /**
   * @deprecated
   * use {@link docWidth} instead
   */
  get doc_width() {
    return this[kObject].doc_width;
  }
  get docWidth() {
    return this[kObject].doc_width;
  }
  /**
   * @deprecated
   * use {@link docHeight} instead
   */
  get doc_height() {
    return this[kObject].doc_height;
  }
  get docHeight() {
    return this[kObject].doc_height;
  }
  retrievePagesInfo() {
    const pages_info = this[kObject].pages_info;
    const pageInfos = [];
    const pageCount = pages_info.page_count;
    for (let i = 0; i < pageCount; i++) {
      const pageAst = pages_info.page(i);
      pageInfos.push({
        pageOffset: pageAst.page_off,
        width: pageAst.width_pt,
        height: pageAst.height_pt
      });
    }
    return pageInfos;
  }
  getSourceLoc(path) {
    return this[kObject].source_span(path);
  }
  /**
   * See {@link TypstRenderer#renderSvg} for more details.
   */
  renderSvg(options) {
    return this.plugin.renderSvg({
      renderSession: this,
      ...options
    });
  }
  /**
   * See {@link TypstRenderer#renderToSvg} for more details.
   */
  renderToSvg(options) {
    return this.plugin.renderToSvg({
      renderSession: this,
      ...options
    });
  }
  /**
   * See {@link TypstRenderer#renderCanvas} for more details.
   */
  renderCanvas(options) {
    return this.plugin.renderCanvas({
      renderSession: this,
      ...options
    });
  }
  /**
   * See {@link TypstRenderer#manipulateData} for more details.
   */
  manipulateData(opts) {
    this.plugin.manipulateData({
      renderSession: this,
      ...opts
    });
  }
  /**
   * See {@link TypstRenderer#renderSvgDiff} for more details.
   */
  renderSvgDiff(opts) {
    return this.plugin.renderSvgDiff({
      renderSession: this,
      ...opts
    });
  }
  /**
   * @deprecated
   * use {@link getSourceLoc} instead
   */
  get_source_loc(path) {
    return this[kObject].source_span(path);
  }
  /**
   * @deprecated
   * use {@link renderSvgDiff} instead
   */
  render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
    return this[kObject].render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
  }
  /**
   * @deprecated
   * use {@link manipulateData} instead
   */
  merge_delta(data) {
    this.plugin.manipulateData({
      renderSession: this,
      action: "merge",
      data
    });
  }
};
const gRendererModule = new LazyWasmModule(async (bin) => {
  const module = await Promise.resolve().then(() => wasmPackShim);
  return await module.default(bin);
});
function createTypstRenderer(pdf) {
  return new TypstRendererDriver(pdf || void 0);
}
function randstr(prefix) {
  return Math.random().toString(36).replace("0.", prefix || "");
}
let warnOnceCanvasSet = true;
class TypstRendererDriver {
  constructor(pdf) {
    this.pdf = pdf;
  }
  async init(options) {
    this.rendererJs = await Promise.resolve().then(() => wasmPackShim);
    const TypstRendererBuilder2 = this.rendererJs.TypstRendererBuilder;
    this.renderer = await buildComponent(options, gRendererModule, TypstRendererBuilder2, {});
  }
  loadGlyphPack(_pack) {
    return Promise.resolve();
  }
  createOptionsToRust(options) {
    const rustOptions = new this.rendererJs.CreateSessionOptions();
    if (options.format !== void 0) {
      rustOptions.format = options.format;
    }
    if (options.artifactContent !== void 0) {
      rustOptions.artifact_content = options.artifactContent;
    }
    return rustOptions;
  }
  retrievePagesInfoFromSession(session) {
    return session.retrievePagesInfo();
  }
  /**
   * Render a Typst document to canvas.
   */
  renderCanvas(options) {
    return this.withinOptionSession(options, async (sessionRef) => {
      const rustOptions = new this.rendererJs.RenderPageImageOptions();
      if (options.pageOffset !== void 0) {
        rustOptions.page_off = options.pageOffset;
      }
      if (options.cacheKey !== void 0) {
        rustOptions.cache_key = options.cacheKey;
      }
      if (options.dataSelection !== void 0) {
        let encoded = 0;
        if (options.dataSelection.body) {
          encoded |= 1 << 0;
        } else if (options.canvas && warnOnceCanvasSet) {
          warnOnceCanvasSet = false;
          console.warn("dataSelection.body is not set but providing canvas for body");
        }
        if (options.dataSelection.text) {
          encoded |= 1 << 1;
        }
        if (options.dataSelection.annotation) {
          encoded |= 1 << 2;
        }
        rustOptions.data_selection = encoded;
      }
      return this.renderer.render_page_to_canvas(sessionRef[kObject], options.canvas || void 0, rustOptions);
    });
  }
  // async renderPdf(artifactContent: string): Promise<Uint8Array> {
  // return this.renderer.render_to_pdf(artifactContent);
  // }
  async inAnimationFrame(fn) {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e);
        }
      });
    });
  }
  async renderDisplayLayer(session, container, canvasList, options) {
    const pages_info = session[kObject].pages_info;
    const page_count = pages_info.page_count;
    const doRender = async (i, page_off) => {
      const canvas = canvasList[i];
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("canvas context is null");
      }
      return await this.renderCanvas({
        canvas: ctx,
        renderSession: session,
        pageOffset: page_off
      });
    };
    return this.inAnimationFrame(async () => {
      const t = performance.now();
      const textContentList = (await Promise.all(
        //   canvasList.map(async (canvas, i) => {
        //     await this.renderImageInSession(session, {
        //       page_off: i,
        //     });
        //     console.log(cyrb53(renderResult.data));
        //     let ctx = canvas.getContext('2d');
        //     if (ctx) {
        //       ctx.putImageData(renderResult, 0, 0);
        //     }
        //     return {
        //       width: renderResult.width,
        //       height: renderResult.height,
        //     };
        //   }),
        // )
        /// seq
        [
          (async () => {
            const results = [];
            for (let i = 0; i < page_count; i++) {
              results.push(await doRender(i, i));
            }
            return results;
          })()
        ]
      ))[0];
      const t3 = performance.now();
      console.log(`display layer used: render = ${(t3 - t).toFixed(1)}ms`);
      return textContentList;
    });
  }
  renderTextLayer(session, view, container, layerList, textSourceList) {
    renderTextLayer(this.pdf, container, view.pageInfos, layerList, textSourceList);
  }
  renderAnnotationLayer(_session, view, _container, layerList, annotationSourceList) {
    const pageInfos = view.pageInfos;
    const t2 = performance.now();
    const renderOne = (layer, i) => {
      const page_info = pageInfos[i];
      if (!page_info) {
        console.error("page not found for", i);
        return;
      }
      const width_pt = page_info.width;
      const height_pt = page_info.height;
      layer.innerHTML = "";
      for (const lnk of annotationSourceList[i].links) {
        const annotationBox = document.createElement("div");
        const x = lnk.annotation_box.transform[4] / width_pt * 100;
        const y = lnk.annotation_box.transform[5] / height_pt * 100;
        const skewY = lnk.annotation_box.transform[1];
        const skewX = lnk.annotation_box.transform[2];
        annotationBox.className = "typst-annotation";
        annotationBox.style.width = `${lnk.annotation_box.width / width_pt * 100}%`;
        annotationBox.style.height = `${lnk.annotation_box.height / height_pt * 100}%`;
        annotationBox.style.left = `${x}%`;
        annotationBox.style.top = `${y}%`;
        annotationBox.style.transform = `matrix(1, ${skewY}, ${skewX}, 1, 0, 0)`;
        switch (lnk.action.t) {
          case "Url": {
            const a = document.createElement("a");
            a.href = lnk.action.v.url;
            a.target = "_blank";
            a.appendChild(annotationBox);
            layer.appendChild(a);
            break;
          }
          case "GoTo": {
            const destPoint = document.createElement("div");
            destPoint.className = "typst-annotation";
            const destX = lnk.action.v.x / width_pt * 100;
            const destY = lnk.action.v.y / height_pt * 100;
            destPoint.style.left = `${destX}%`;
            destPoint.style.top = `${destY}%`;
            const destId = randstr("lnk-");
            destPoint.id = destId;
            const destLayer = layerList[lnk.action.v.page_ref - 1];
            destLayer.appendChild(destPoint);
            const a = document.createElement("a");
            a.href = `#${destId}`;
            a.appendChild(annotationBox);
            layer.appendChild(a);
            break;
          }
          default:
            console.warn("unknown action", lnk);
            break;
        }
      }
    };
    layerList.forEach(renderOne);
    const t3 = performance.now();
    console.log(`annotation layer used: render = ${(t3 - t2).toFixed(1)}ms`);
  }
  async render(options) {
    if ("format" in options) {
      if (options.format !== "vector") {
        const artifactFormats = ["serde_json", "js", "ir"];
        if (artifactFormats.includes(options.format)) {
          throw new Error(`deprecated format ${options.format}, please use vector format`);
        }
      }
    }
    return this.renderToCanvas(options);
  }
  async renderToCanvas(options) {
    let session;
    let renderPageResults;
    const mountContainer = options.container;
    mountContainer.style.visibility = "hidden";
    const doRenderDisplayLayer = async (canvasList, resetLayout) => {
      try {
        renderPageResults = await this.renderDisplayLayer(session, mountContainer, canvasList, options);
        resetLayout();
      } finally {
        mountContainer.style.visibility = "visible";
      }
    };
    return this.withinOptionSession(options, async (sessionRef) => {
      session = sessionRef;
      if (session[kObject].pages_info.page_count === 0) {
        throw new Error(`No page found in session`);
      }
      if (options.pixelPerPt !== void 0 && options.pixelPerPt <= 0) {
        throw new Error("Invalid typst.RenderOptions.pixelPerPt, should be a positive number " + options.pixelPerPt);
      }
      let backgroundColor = options.backgroundColor;
      if (backgroundColor !== void 0) {
        if (!/^#[0-9a-f]{6}$/.test(backgroundColor)) {
          throw new Error("Invalid typst.backgroundColor color for matching ^#?[0-9a-f]{6}$ " + backgroundColor);
        }
      }
      session.pixelPerPt = options.pixelPerPt ?? 3;
      session.backgroundColor = backgroundColor ?? "#ffffff";
      const t = performance.now();
      const pageView = new RenderView(this.retrievePagesInfoFromSession(session), mountContainer, options);
      const t2 = performance.now();
      console.log(`layer used: retieve = ${(t2 - t).toFixed(1)}ms`);
      await doRenderDisplayLayer(pageView.canvasList, () => pageView.resetLayout());
      this.renderTextLayer(session, pageView, mountContainer, pageView.textLayerList, renderPageResults.map((r) => r.textContent));
      this.renderAnnotationLayer(session, pageView, mountContainer, pageView.annotationLayerList, renderPageResults.map((r) => r.annotationList));
      return;
    });
  }
  createModule(b) {
    return Promise.resolve(new RenderSession$1(this, this.renderer.create_session(b && this.createOptionsToRust({
      format: "vector",
      artifactContent: b
    }))));
  }
  renderSvg(options, container) {
    if (options instanceof RenderSession$1 || container) {
      throw new Error("removed api, please use renderToSvg({ renderSession, container }) instead");
    }
    return this.withinOptionSession(options, async (sessionRef) => {
      let parts = void 0;
      if (options.data_selection) {
        parts = 0;
        if (options.data_selection.body) {
          parts |= 1 << 0;
        }
        if (options.data_selection.defs) {
          parts |= 1 << 1;
        }
        if (options.data_selection.css) {
          parts |= 1 << 2;
        }
        if (options.data_selection.js) {
          parts |= 1 << 3;
        }
      }
      return Promise.resolve(this.renderer.svg_data(sessionRef[kObject], parts));
    });
  }
  renderSvgDiff(options) {
    if (!options.window) {
      return this.renderer.render_svg_diff(options.renderSession[kObject], 0, 0, 1e33, 1e33);
    }
    return this.renderer.render_svg_diff(options.renderSession[kObject], options.window.lo.x, options.window.lo.y, options.window.hi.x, options.window.hi.y);
  }
  renderToSvg(options) {
    return this.withinOptionSession(options, async (sessionRef) => {
      return Promise.resolve(this.renderer.render_svg(sessionRef[kObject], options.container));
    });
  }
  getCustomV1(options) {
    return Promise.resolve(this.renderer.get_customs(options.renderSession[kObject]));
  }
  resetSession(session) {
    return this.renderer.reset(session[kObject]);
  }
  manipulateData(opts) {
    return this.renderer.manipulate_data(opts.renderSession[kObject], opts.action ?? "reset", opts.data);
  }
  withinOptionSession(options, fn) {
    function isRenderByContentOption(options2) {
      return "artifactContent" in options2;
    }
    if ("renderSession" in options) {
      return fn(options.renderSession);
    }
    if (isRenderByContentOption(options)) {
      return this.runWithSession(options, fn);
    }
    throw new Error("Invalid render options, should be one of RenderByContentOptions|RenderBySessionOptions");
  }
  async runWithSession(arg1, arg2) {
    let options = arg1;
    let fn = arg2;
    if (!arg2) {
      options = void 0;
      fn = arg1;
    }
    const session = this.renderer.create_session(
      /* moved */
      options && this.createOptionsToRust(options)
    );
    try {
      const res = await fn(new RenderSession$1(this, session));
      session.free();
      return res;
    } catch (e) {
      session.free();
      throw e;
    }
  }
}
window.TypstRenderModule = {
  createTypstRenderer
};
function postProcessCrossLinks(appElem) {
  appElem.querySelectorAll(".pseudo-link").forEach((link) => {
    const a = link.parentElement;
    if (origin) {
      const onclick = a.getAttribute("onclick");
      if (onclick === null) {
        let target = a.getAttribute("target");
        if (target === "_blank") {
          a.removeAttribute("target");
        }
      } else if (globalSemaLabels) {
        if (onclick.startsWith("handleTypstLocation")) {
          const [u, x, y] = onclick.split("(")[1].split(")")[0].split(",").slice(1).map((s) => Number.parseFloat(s.trim()));
          for (const [label, pos] of globalSemaLabels) {
            const [u1, x1, y1] = pos;
            if (u === u1 && Math.abs(x - x1) < 0.01 && Math.abs(y - y1) < 0.01) {
              a.id = `typst-label-${label}`;
              a.setAttribute("href", `#label-${label}`);
              a.setAttribute("xlink:href", `#label-${label}`);
              break;
            }
          }
        }
      }
    }
    const decodeTypstUrlc = (s) => s.split("-").map((s2) => {
      const n = Number.parseInt(s2);
      if (Number.isNaN(n)) {
        return s2;
      } else {
        return String.fromCharCode(n);
      }
    }).join("");
    const href = a.getAttribute("href") || a.getAttribute("xlink:href");
    if (href.startsWith("cross-link")) {
      const url = new URL(href);
      const pathLabelUnicodes = url.searchParams.get("path-label");
      const labelUnicodes = url.searchParams.get("label");
      const plb = decodeTypstUrlc(pathLabelUnicodes).replace(".typ", ".html").replace(/^\//g, "");
      let absolutePath = window.typstPathToRoot ? window.typstPathToRoot.replace(/\/$/g, "") : "";
      absolutePath = new URL(`${absolutePath}/${plb}`, window.location.href).href;
      if (labelUnicodes) {
        absolutePath += "#label-" + encodeURIComponent(decodeTypstUrlc(labelUnicodes));
      }
      a.setAttribute("href", absolutePath);
      a.setAttribute("xlink:href", absolutePath);
    }
  });
}
let prevHovers = void 0;
function updateHovers(elems) {
  if (prevHovers) {
    for (const h of prevHovers) {
      h.classList.remove("focus");
    }
  }
  prevHovers = elems;
}
let globalSemaLabels = [];
window.assignSemaHash = (u, x, y) => {
  for (const [label, pos] of globalSemaLabels) {
    const [u1, x1, y1] = pos;
    if (u === u1 && Math.abs(x - x1) < 0.01 && Math.abs(y - y1) < 0.01) {
      location.hash = `label-${label}`;
      const semaLinkLocation = document.getElementById(`typst-label-${label}`);
      const relatedElems = window.typstGetRelatedElements(semaLinkLocation);
      for (const h of relatedElems) {
        h.classList.add("focus");
      }
      updateHovers(relatedElems);
      return;
    }
  }
  updateHovers([]);
  location.hash = `loc-${u}x${x.toFixed(2)}x${y.toFixed(2)}`;
};
window.typstBookRenderPage = function(plugin, relPath, appContainer) {
  const getTheme = () => window.getTypstTheme();
  let currTheme = getTheme();
  let svgModule = void 0;
  const appElem = document.createElement("div");
  if (appElem && appContainer) {
    appElem.className = "typst-app";
    appContainer.appendChild(appElem);
  }
  async function reloadArtifact(theme) {
    if (svgModule) {
      try {
        svgModule[kObject].free();
      } catch (e) {
      }
    }
    appElem.innerHTML = "";
    appElem.removeAttribute("data-applied-width");
    performance.now();
    const artifactData = await fetch(`${relPath}.${theme}.multi.sir.in`).then((response) => response.arrayBuffer()).then((buffer) => new Uint8Array(buffer));
    const t1 = performance.now();
    svgModule = await plugin.createModule(artifactData);
    const t2 = performance.now();
    console.log(
      `theme = ${theme}, load artifact took ${t2 - t1} milliseconds, parse artifact took ${t2 - t1} milliseconds`
    );
  }
  const dec = new TextDecoder();
  reloadArtifact(currTheme).then(() => {
    let initialRender = true;
    const runRender = async () => {
      appElem.style.margin = `0px`;
      const cached = await plugin.renderToSvg({
        renderSession: svgModule,
        container: appElem
      });
      if (!cached) {
        const customs = await plugin.getCustomV1({
          renderSession: svgModule
        });
        const semaLabel = customs.find((k) => k[0] === "sema-label");
        if (semaLabel) {
          const labelBin = semaLabel[1];
          const labels = JSON.parse(dec.decode(labelBin));
          globalSemaLabels = labels.map(([label, pos]) => {
            const [_, u, x, y] = pos.split(/[pxy]/).map(Number.parseFloat);
            return [encodeURIComponent(label), [u, x, y]];
          });
        }
      }
      postProcessCrossLinks(appElem);
      const w = appElem.getAttribute("data-applied-width");
      if (w) {
        const parentWidth = appElem.parentElement.clientWidth;
        const svgWidth = Number.parseInt(w.slice(0, w.length - 2));
        const wMargin = (parentWidth - svgWidth) / 2;
        if (wMargin < 0) {
          appElem.style.margin = `0px`;
        } else {
          appElem.style.margin = `0 ${wMargin}px`;
        }
      }
      if (!cached && window.location.hash) {
        const hash = window.location.hash;
        const firstSep = hash.indexOf("-");
        if (firstSep != -1 && hash.slice(0, firstSep) === "#label") {
          const labelTarget = hash.slice(firstSep + 1);
          for (const [label, pos] of globalSemaLabels) {
            if (label === labelTarget) {
              const [u, x, y] = pos;
              window.handleTypstLocation(appElem.firstElementChild, u, x, y, {
                behavior: initialRender ? "smooth" : "instant"
              });
              initialRender = false;
              break;
            }
          }
        }
      }
    };
    let base = runRender();
    window.typstRerender = () => {
      return base = base.then(runRender);
    };
    window.typstChangeTheme = () => {
      const nextTheme = getTheme();
      if (nextTheme === currTheme) {
        return base;
      }
      currTheme = nextTheme;
      return base = base.then(() => reloadArtifact(currTheme).then(runRender));
    };
    window.onresize = window.typstRerender;
    window.typstChangeTheme();
  });
};
let wasm;
const cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
let cachedUint8Memory0 = null;
function getUint8Memory0() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
const heap = new Array(128).fill(void 0);
heap.push(void 0, null, true, false);
let heap_next = heap.length;
function addHeapObject(obj) {
  if (heap_next === heap.length)
    heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  if (typeof heap_next !== "number")
    throw new Error("corrupt heap");
  heap[idx] = obj;
  return idx;
}
function getObject(idx) {
  return heap[idx];
}
function dropObject(idx) {
  if (idx < 132)
    return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
function _assertBoolean(n) {
  if (typeof n !== "boolean") {
    throw new Error("expected a boolean argument");
  }
}
let WASM_VECTOR_LEN = 0;
const cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
  throw Error("TextEncoder not available");
} };
const encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
  const buf = cachedTextEncoder.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
function passStringToWasm0(arg, malloc, realloc) {
  if (typeof arg !== "string")
    throw new Error("expected a string argument");
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8Memory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8Memory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127)
      break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    if (ret.read !== arg.length)
      throw new Error("failed to pass whole string");
    offset += ret.written;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
let cachedInt32Memory0 = null;
function getInt32Memory0() {
  if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function makeClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    try {
      return f(state.a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_2.get(state.dtor)(state.a, state.b);
        state.a = 0;
      }
    }
  };
  real.original = state;
  return real;
}
function logError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    let error = function() {
      try {
        return e instanceof Error ? `${e.message}

Stack:
${e.stack}` : e.toString();
      } catch (_) {
        return "<failed to stringify thrown value>";
      }
    }();
    console.error("wasm-bindgen: imported JS function that was not marked as `catch` threw an error:", error);
    throw e;
  }
}
function _assertNum(n) {
  if (typeof n !== "number")
    throw new Error("expected a number argument");
}
function __wbg_adapter_24(arg0, arg1, arg2) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm._dyn_core__ops__function__Fn__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hcfa11a3d954f8cba(arg0, arg1, addHeapObject(arg2));
}
function __wbg_adapter_27(arg0, arg1) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm._dyn_core__ops__function__Fn_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h82f5239a9f693e6a(arg0, arg1);
}
function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;
  return real;
}
function __wbg_adapter_30(arg0, arg1, arg2) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h2719cfa4210b6747(arg0, arg1, addHeapObject(arg2));
}
function renderer_build_info() {
  const ret = wasm.renderer_build_info();
  return takeObject(ret);
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
  return instance.ptr;
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8Memory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
let cachedFloat32Memory0 = null;
function getFloat32Memory0() {
  if (cachedFloat32Memory0 === null || cachedFloat32Memory0.byteLength === 0) {
    cachedFloat32Memory0 = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32Memory0;
}
let cachedUint32Memory0 = null;
function getUint32Memory0() {
  if (cachedUint32Memory0 === null || cachedUint32Memory0.byteLength === 0) {
    cachedUint32Memory0 = new Uint32Array(wasm.memory.buffer);
  }
  return cachedUint32Memory0;
}
function passArray32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getUint32Memory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}
function __wbg_adapter_104(arg0, arg1, arg2, arg3) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm.wasm_bindgen__convert__closures__invoke2_mut__hbaaf7f84cc30f75f(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}
class CreateSessionOptions {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_createsessionoptions_free(ptr);
  }
  /**
  */
  constructor() {
    const ret = wasm.createsessionoptions_new();
    this.__wbg_ptr = ret >>> 0;
    return this;
  }
  /**
  * @param {string} format
  */
  set format(format) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.createsessionoptions_set_format(this.__wbg_ptr, ptr0, len0);
  }
  /**
  * @param {Uint8Array} artifact_content
  */
  set artifact_content(artifact_content) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ptr0 = passArray8ToWasm0(artifact_content, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.createsessionoptions_set_artifact_content(this.__wbg_ptr, ptr0, len0);
  }
}
class PageInfo {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(PageInfo.prototype);
    obj.__wbg_ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_pageinfo_free(ptr);
  }
  /**
  * @returns {number}
  */
  get page_off() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.pageinfo_page_off(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
  * @returns {number}
  */
  get width_pt() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.pageinfo_width_pt(this.__wbg_ptr);
    return ret;
  }
  /**
  * @returns {number}
  */
  get height_pt() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.pageinfo_height_pt(this.__wbg_ptr);
    return ret;
  }
}
class PagesInfo {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(PagesInfo.prototype);
    obj.__wbg_ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_pagesinfo_free(ptr);
  }
  /**
  * @returns {number}
  */
  get page_count() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.pagesinfo_page_count(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
  * @param {number} num
  * @returns {PageInfo | undefined}
  */
  page_by_number(num) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertNum(num);
    const ret = wasm.pagesinfo_page_by_number(this.__wbg_ptr, num);
    return ret === 0 ? void 0 : PageInfo.__wrap(ret);
  }
  /**
  * @param {number} i
  * @returns {PageInfo}
  */
  page(i) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertNum(i);
    const ret = wasm.pagesinfo_page(this.__wbg_ptr, i);
    return PageInfo.__wrap(ret);
  }
  /**
  * @returns {number}
  */
  width() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.pagesinfo_width(this.__wbg_ptr);
    return ret;
  }
  /**
  * @returns {number}
  */
  height() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.pagesinfo_height(this.__wbg_ptr);
    return ret;
  }
}
class RenderPageImageOptions {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_renderpageimageoptions_free(ptr);
  }
  /**
  */
  constructor() {
    const ret = wasm.renderpageimageoptions_new();
    this.__wbg_ptr = ret >>> 0;
    return this;
  }
  /**
  * @returns {number | undefined}
  */
  get page_off() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.renderpageimageoptions_page_off(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1 >>> 0;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {number | undefined} [page_off]
  */
  set page_off(page_off) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    if (!isLikeNone(page_off)) {
      _assertNum(page_off);
    }
    wasm.renderpageimageoptions_set_page_off(this.__wbg_ptr, !isLikeNone(page_off), isLikeNone(page_off) ? 0 : page_off);
  }
  /**
  * @returns {string | undefined}
  */
  get cache_key() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.renderpageimageoptions_cache_key(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      let v1;
      if (r0 !== 0) {
        v1 = getStringFromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {string | undefined} [cache_key]
  */
  set cache_key(cache_key) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    var ptr0 = isLikeNone(cache_key) ? 0 : passStringToWasm0(cache_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.renderpageimageoptions_set_cache_key(this.__wbg_ptr, ptr0, len0);
  }
  /**
  * @returns {number | undefined}
  */
  get data_selection() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.renderpageimageoptions_data_selection(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1 >>> 0;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {number | undefined} [data_selection]
  */
  set data_selection(data_selection) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    if (!isLikeNone(data_selection)) {
      _assertNum(data_selection);
    }
    wasm.renderpageimageoptions_set_data_selection(this.__wbg_ptr, !isLikeNone(data_selection), isLikeNone(data_selection) ? 0 : data_selection);
  }
}
class RenderSession2 {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(RenderSession2.prototype);
    obj.__wbg_ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_rendersession_free(ptr);
  }
  /**
  * @param {number} rect_lo_x
  * @param {number} rect_lo_y
  * @param {number} rect_hi_x
  * @param {number} rect_hi_y
  * @returns {string}
  */
  render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.rendersession_render_in_window(retptr, this.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
  * @returns {number | undefined}
  */
  get pixel_per_pt() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.rendersession_pixel_per_pt(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getFloat32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {number} pixel_per_pt
  */
  set pixel_per_pt(pixel_per_pt) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    wasm.rendersession_set_pixel_per_pt(this.__wbg_ptr, pixel_per_pt);
  }
  /**
  * @returns {string | undefined}
  */
  get background_color() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.rendersession_background_color(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      let v1;
      if (r0 !== 0) {
        v1 = getStringFromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {string} background_color
  */
  set background_color(background_color) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(background_color, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.rendersession_set_background_color(this.__wbg_ptr, ptr0, len0);
  }
  /**
  * @returns {PagesInfo}
  */
  get pages_info() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.rendersession_pages_info(this.__wbg_ptr);
    return PagesInfo.__wrap(ret);
  }
  /**
  * @returns {number}
  */
  get doc_width() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.rendersession_doc_width(this.__wbg_ptr);
    return ret;
  }
  /**
  * @returns {number}
  */
  get doc_height() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.rendersession_doc_height(this.__wbg_ptr);
    return ret;
  }
  /**
  * @param {Uint32Array} path
  * @returns {string | undefined}
  */
  source_span(path) {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      const ptr0 = passArray32ToWasm0(path, wasm.__wbindgen_malloc);
      const len0 = WASM_VECTOR_LEN;
      wasm.rendersession_source_span(retptr, this.__wbg_ptr, ptr0, len0);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      var r3 = getInt32Memory0()[retptr / 4 + 3];
      if (r3) {
        throw takeObject(r2);
      }
      let v2;
      if (r0 !== 0) {
        v2 = getStringFromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1, 1);
      }
      return v2;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
}
class RenderSessionOptions {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_rendersessionoptions_free(ptr);
  }
  /**
  */
  constructor() {
    const ret = wasm.rendersessionoptions_new();
    this.__wbg_ptr = ret >>> 0;
    return this;
  }
  /**
  * @returns {number | undefined}
  */
  get pixel_per_pt() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.rendersession_pixel_per_pt(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getFloat32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {number} pixel_per_pt
  */
  set pixel_per_pt(pixel_per_pt) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    wasm.rendersession_set_pixel_per_pt(this.__wbg_ptr, pixel_per_pt);
  }
  /**
  * @returns {string | undefined}
  */
  get background_color() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.rendersessionoptions_background_color(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      let v1;
      if (r0 !== 0) {
        v1 = getStringFromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {string} background_color
  */
  set background_color(background_color) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(background_color, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.rendersessionoptions_set_background_color(this.__wbg_ptr, ptr0, len0);
  }
  /**
  * @returns {string | undefined}
  */
  get format() {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.rendersessionoptions_format(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      let v1;
      if (r0 !== 0) {
        v1 = getStringFromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {string} format
  */
  set format(format) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.rendersessionoptions_set_format(this.__wbg_ptr, ptr0, len0);
  }
}
class TypstRenderer {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(TypstRenderer.prototype);
    obj.__wbg_ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_typstrenderer_free(ptr);
  }
  /**
  */
  constructor() {
    const ret = wasm.typstrenderer_new();
    this.__wbg_ptr = ret >>> 0;
    return this;
  }
  /**
  * @param {CreateSessionOptions | undefined} [options]
  * @returns {RenderSession}
  */
  create_session(options) {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      let ptr0 = 0;
      if (!isLikeNone(options)) {
        _assertClass(options, CreateSessionOptions);
        if (options.__wbg_ptr === 0) {
          throw new Error("Attempt to use a moved value");
        }
        ptr0 = options.__destroy_into_raw();
      }
      wasm.typstrenderer_create_session(retptr, this.__wbg_ptr, ptr0);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return RenderSession2.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {RenderSession} session
  */
  reset(session) {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass(session, RenderSession2);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      wasm.typstrenderer_reset(retptr, this.__wbg_ptr, session.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {RenderSession} session
  * @param {string} action
  * @param {Uint8Array} data
  */
  manipulate_data(session, action, data) {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass(session, RenderSession2);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      const ptr0 = passStringToWasm0(action, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
      const len1 = WASM_VECTOR_LEN;
      wasm.typstrenderer_manipulate_data(retptr, this.__wbg_ptr, session.__wbg_ptr, ptr0, len0, ptr1, len1);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {Uint8Array} artifact_content
  * @param {string} decoder
  * @returns {RenderSession}
  */
  session_from_artifact(artifact_content, decoder) {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      const ptr0 = passArray8ToWasm0(artifact_content, wasm.__wbindgen_malloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(decoder, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      wasm.typstrenderer_session_from_artifact(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return RenderSession2.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {RenderSession} session
  * @param {number} rect_lo_x
  * @param {number} rect_lo_y
  * @param {number} rect_hi_x
  * @param {number} rect_hi_y
  * @returns {string}
  */
  render_svg_diff(session, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass(session, RenderSession2);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      wasm.typstrenderer_render_svg_diff(retptr, this.__wbg_ptr, session.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
  * @param {RenderSession} session
  * @param {number | undefined} [parts]
  * @returns {string}
  */
  svg_data(session, parts) {
    let deferred2_0;
    let deferred2_1;
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass(session, RenderSession2);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      if (!isLikeNone(parts)) {
        _assertNum(parts);
      }
      wasm.typstrenderer_svg_data(retptr, this.__wbg_ptr, session.__wbg_ptr, !isLikeNone(parts), isLikeNone(parts) ? 0 : parts);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      var r3 = getInt32Memory0()[retptr / 4 + 3];
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
  /**
  * @param {RenderSession} session
  * @returns {Array<any> | undefined}
  */
  get_customs(session) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertClass(session, RenderSession2);
    if (session.__wbg_ptr === 0) {
      throw new Error("Attempt to use a moved value");
    }
    const ret = wasm.typstrenderer_get_customs(this.__wbg_ptr, session.__wbg_ptr);
    return takeObject(ret);
  }
  /**
  * @param {RenderSession} session
  * @param {HTMLElement} root
  * @returns {boolean}
  */
  render_svg(session, root) {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass(session, RenderSession2);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      wasm.typstrenderer_render_svg(retptr, this.__wbg_ptr, session.__wbg_ptr, addHeapObject(root));
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return r0 !== 0;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {any} _v
  */
  load_glyph_pack(_v) {
    try {
      if (this.__wbg_ptr == 0)
        throw new Error("Attempt to use a moved value");
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm.typstrenderer_load_glyph_pack(retptr, this.__wbg_ptr, addHeapObject(_v));
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @param {RenderSession} ses
  * @param {CanvasRenderingContext2D | undefined} [canvas]
  * @param {RenderPageImageOptions | undefined} [options]
  * @returns {Promise<any>}
  */
  render_page_to_canvas(ses, canvas, options) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertClass(ses, RenderSession2);
    if (ses.__wbg_ptr === 0) {
      throw new Error("Attempt to use a moved value");
    }
    let ptr0 = 0;
    if (!isLikeNone(options)) {
      _assertClass(options, RenderPageImageOptions);
      if (options.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      ptr0 = options.__destroy_into_raw();
    }
    const ret = wasm.typstrenderer_render_page_to_canvas(this.__wbg_ptr, ses.__wbg_ptr, isLikeNone(canvas) ? 0 : addHeapObject(canvas), ptr0);
    return takeObject(ret);
  }
}
class TypstRendererBuilder {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_typstrendererbuilder_free(ptr);
  }
  /**
  * @param {Uint8Array} _font_buffer
  * @returns {Promise<void>}
  */
  add_raw_font(_font_buffer) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.typstrendererbuilder_add_raw_font(this.__wbg_ptr, addHeapObject(_font_buffer));
    return takeObject(ret);
  }
  /**
  * @param {Array<any>} _fonts
  * @returns {Promise<void>}
  */
  add_web_fonts(_fonts) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.typstrendererbuilder_add_web_fonts(this.__wbg_ptr, addHeapObject(_fonts));
    return takeObject(ret);
  }
  /**
  * @param {any} _pack
  * @returns {Promise<void>}
  */
  add_glyph_pack(_pack) {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm.typstrendererbuilder_add_glyph_pack(this.__wbg_ptr, addHeapObject(_pack));
    return takeObject(ret);
  }
  /**
  */
  constructor() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstrendererbuilder_new(retptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
  * @returns {Promise<TypstRenderer>}
  */
  build() {
    if (this.__wbg_ptr == 0)
      throw new Error("Attempt to use a moved value");
    const ptr = this.__destroy_into_raw();
    _assertNum(ptr);
    const ret = wasm.typstrendererbuilder_build(ptr);
    return takeObject(ret);
  }
}
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        if (module.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_warn_f260f49434e45e62 = function() {
    return logError(function(arg0) {
      console.warn(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbg_new_9fb8d994e1c0aaac = function() {
    return logError(function() {
      const ret = new Object();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_set_8761474ad72b9bf1 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
    }, arguments);
  };
  imports.wbg.__wbindgen_number_new = function(arg0) {
    const ret = arg0;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_clientWidth_eca2065ae6dd9dcd = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).clientWidth;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_getAttribute_bff489553dd803cc = function() {
    return logError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg1).getAttribute(getStringFromWasm0(arg2, arg3));
      var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len1 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len1;
      getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    }, arguments);
  };
  imports.wbg.__wbg_setinnerHTML_ce0d6527ce4086f2 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).innerHTML = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_instanceof_Window_3e5cd1f48c152d01 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof Window;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_get_7b48513de5dc5ea4 = function() {
    return handleError(function(arg0, arg1) {
      const ret = Reflect.get(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_is_function = function(arg0) {
    const ret = typeof getObject(arg0) === "function";
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbg_firstElementChild_f33d0a5033abeb8f = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).firstElementChild;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_5da1969d7cd31ccd = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_setAttribute_e7b72a5e7cfcb5a3 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_set_759f75cd92b612d2 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_new_ffc6d4d085022169 = function() {
    return logError(function() {
      const ret = new Array();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_push_901f3914205d44de = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject(arg0).push(getObject(arg1));
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_new_60f57089c7563e81 = function() {
    return logError(function(arg0, arg1) {
      try {
        var state0 = { a: arg0, b: arg1 };
        var cb0 = (arg02, arg12) => {
          const a = state0.a;
          state0.a = 0;
          try {
            return __wbg_adapter_104(a, state0.b, arg02, arg12);
          } finally {
            state0.a = a;
          }
        };
        const ret = new Promise(cb0);
        return addHeapObject(ret);
      } finally {
        state0.a = state0.b = 0;
      }
    }, arguments);
  };
  imports.wbg.__wbg_typstrenderer_new = function() {
    return logError(function(arg0) {
      const ret = TypstRenderer.__wrap(arg0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_setTransform_1e902886ef6ea486 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      getObject(arg0).setTransform(arg1, arg2, arg3, arg4, arg5, arg6);
    }, arguments);
  };
  imports.wbg.__wbg_setfillStyle_1ebd7d8f502888fa = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).fillStyle = getObject(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_fillRect_ae135cf52671cb3d = function() {
    return logError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).fillRect(arg1, arg2, arg3, arg4);
    }, arguments);
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_buffer_a448f833075b71ba = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).buffer;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_d0482f893617af71 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_8f67e318f15d7254 = function() {
    return logError(function(arg0) {
      const ret = new Uint8Array(getObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_abda76e883ba8a5f = function() {
    return logError(function() {
      const ret = new Error();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_stack_658279fe44541cf6 = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject(arg1).stack;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len1;
      getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    }, arguments);
  };
  imports.wbg.__wbg_error_f851667af71bcfc6 = function() {
    return logError(function(arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
      } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
      }
    }, arguments);
  };
  imports.wbg.__wbg_self_f0e34d89f33b99fd = function() {
    return handleError(function() {
      const ret = self.self;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_window_d3b084224f4774d7 = function() {
    return handleError(function() {
      const ret = window.window;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_globalThis_9caa27ff917c6860 = function() {
    return handleError(function() {
      const ret = globalThis.globalThis;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_global_35dfdd59a4da3e74 = function() {
    return handleError(function() {
      const ret = global.global;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_is_undefined = function(arg0) {
    const ret = getObject(arg0) === void 0;
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbg_newnoargs_c62ea9419c21fbac = function() {
    return logError(function(arg0, arg1) {
      const ret = new Function(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_90c26b09837aba1c = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).call(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_set_f2740edb12e318cd = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
    }, arguments);
  };
  imports.wbg.__wbg_new_a64e3f2afc2cf2f8 = function() {
    return logError(function(arg0, arg1) {
      const ret = new Error(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_resolve_6e1c6553a82f85b7 = function() {
    return logError(function(arg0) {
      const ret = Promise.resolve(getObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_then_3ab08cd4fbb91ae9 = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject(arg0).then(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_then_8371cc12cfedc5a2 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_length_1d25fa9e4ac21ce7 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).length;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_set_2357bf09366ee480 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    }, arguments);
  };
  imports.wbg.__wbg_newwithlength_6c2df9e2f3028c43 = function() {
    return logError(function(arg0) {
      const ret = new Uint8Array(arg0 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len1;
    getInt32Memory0()[arg0 / 4 + 0] = ptr1;
  };
  imports.wbg.__wbg_stringify_e1b19966d964d242 = function() {
    return handleError(function(arg0) {
      const ret = JSON.stringify(getObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_revokeObjectURL_9af274f952125d72 = function() {
    return handleError(function(arg0, arg1) {
      URL.revokeObjectURL(getStringFromWasm0(arg0, arg1));
    }, arguments);
  };
  imports.wbg.__wbg_log_a4530b4fe289336f = function() {
    return logError(function(arg0) {
      console.log(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlImageElement_3c3f09de2a0d9341 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject(arg0) instanceof HTMLImageElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbindgen_cb_drop = function(arg0) {
    const obj = takeObject(arg0).original;
    if (obj.cnt-- == 1) {
      obj.a = 0;
      return true;
    }
    const ret = false;
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbg_restore_7c05e5338cb2f7dc = function() {
    return logError(function(arg0) {
      getObject(arg0).restore();
    }, arguments);
  };
  imports.wbg.__wbg_setsrc_1499513e3f9920f2 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).src = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setonload_057aa205dfbc1daa = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).onload = getObject(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_setonerror_798d02958f38c03e = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).onerror = getObject(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_newwithu8arraysequenceandoptions_8a6b4effbcac4a62 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new Blob(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createObjectURL_9fbd9480174d7f02 = function() {
    return handleError(function(arg0, arg1) {
      const ret = URL.createObjectURL(getObject(arg1));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len1;
      getInt32Memory0()[arg0 / 4 + 0] = ptr1;
    }, arguments);
  };
  imports.wbg.__wbg_save_7222a99e05e4831b = function() {
    return logError(function(arg0) {
      getObject(arg0).save();
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_e193863962ffad3c = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_newwithpathstring_5d5857af991a1793 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new Path2D(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_clip_221a6cbf2c2f8eb2 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).clip(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setlineCap_330669b74ac7930c = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).lineCap = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setlineJoin_c500a2f6269415a3 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject(arg0).lineJoin = getStringFromWasm0(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setmiterLimit_ba6b996b10cbafc7 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).miterLimit = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setlineDashOffset_1b48454bf76f6403 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).lineDashOffset = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setLineDash_108d5f6614e2353f = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).setLineDash(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setlineWidth_d101118d79143f42 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).lineWidth = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_fill_680fbd1051959e06 = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).fill(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setstrokeStyle_1b4551387606453b = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).strokeStyle = getObject(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_stroke_17e131a9f9d9d9bc = function() {
    return logError(function(arg0, arg1) {
      getObject(arg0).stroke(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_document_d609202d16c38224 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).document;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createElement_fdd5c113cb84539e = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).createElement(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
    const ret = debugString(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len1;
    getInt32Memory0()[arg0 / 4 + 0] = ptr1;
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg_queueMicrotask_4d890031a6a5a50c = function() {
    return logError(function(arg0) {
      queueMicrotask(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_queueMicrotask_adae4bc085237231 = function() {
    return logError(function(arg0) {
      const ret = getObject(arg0).queueMicrotask;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_closure_wrapper2182 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = makeClosure(arg0, arg1, 556, __wbg_adapter_24);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_closure_wrapper2183 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = makeClosure(arg0, arg1, 556, __wbg_adapter_27);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_closure_wrapper3613 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = makeMutClosure(arg0, arg1, 1231, __wbg_adapter_30);
      return addHeapObject(ret);
    }, arguments);
  };
  return imports;
}
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedFloat32Memory0 = null;
  cachedInt32Memory0 = null;
  cachedUint32Memory0 = null;
  cachedUint8Memory0 = null;
  return wasm;
}
function initSync(module) {
  if (wasm !== void 0)
    return wasm;
  const imports = __wbg_get_imports();
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init(instance, module);
}
async function __wbg_init(input) {
  if (wasm !== void 0)
    return wasm;
  if (typeof input === "undefined") {
    input = importWasmModule("typst_ts_renderer_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
    input = fetch(input);
  }
  const { instance, module } = await __wbg_load(await input, imports);
  return __wbg_finalize_init(instance, module);
}
let importWasmModule = async function(wasm_name, url) {
  throw new Error("Cannot import wasm module without importer: " + wasm_name + " " + url);
};
function setImportWasmModule(importer) {
  importWasmModule = importer;
}
let nodeJsImportWasmModule = async function(wasm_name, url) {
  const escapeImport = new Function("m", "return import(m)");
  const path = await escapeImport("path");
  const { readFileSync } = await escapeImport("fs");
  const wasmPath = new URL(path.join(path.dirname(url), wasm_name));
  return await readFileSync(wasmPath).buffer;
};
const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
if (isNode) {
  setImportWasmModule(nodeJsImportWasmModule);
}
const wasmPackShim = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  CreateSessionOptions,
  PageInfo,
  PagesInfo,
  RenderPageImageOptions,
  RenderSession: RenderSession2,
  RenderSessionOptions,
  TypstRenderer,
  TypstRendererBuilder,
  default: __wbg_init,
  initSync,
  renderer_build_info,
  setImportWasmModule
}, Symbol.toStringTag, { value: "Module" }));
