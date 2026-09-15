// 极简 reactive 实现，支持简单的属性读写 + 监听
export function reactive(target) {
  const listeners = {};
  const obj = { ...target };

  obj.on = function(key, fn) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(fn);
  };
  obj.off = function(key, fn) {
    if (!listeners[key]) return;
    listeners[key] = listeners[key].filter(f => f !== fn);
  };
  obj.set = function(key, val) {
    obj[key] = val;
    if (listeners[key]) listeners[key].forEach(fn => fn(val));
  };
  obj.update = function(obj2) {
    Object.assign(obj, obj2);
    Object.keys(listeners).forEach(k => {
      if (k in obj2) listeners[k].forEach(fn => fn(obj[k]));
    });
  };

  return new Proxy(obj, {
    set(target, key, val) {
      target[key] = val;
      if (listeners[key]) listeners[key].forEach(fn => fn(val));
      return true;
    }
  });
}
