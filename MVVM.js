// 基类 接收参数 负责调度
class Vue {
  constructor(options) {
    // this.$el $data $options
    this.$el = options.el
    this.$data = options.data
    let computed = options.computed
    let methods = options.methods
    // 这个根元素存在 编译模板
    if (this.$el) {
      // 数据劫持: 把数据全部转化成 Object.defineProperty定义的数据
      new Observer(this.$data, this)

      this.computedHandle(computed)
      this.methodHandle(methods)

      // vm上的取值和赋值操作都代理到 vm.$data 方便用户操作
      this.proxyVm(this.$data)

      // 编译模板
      new Compiler(this.$el, this)
    }
  }

  methodHandle(methods) {
    for (let key in methods) {
      Object.defineProperty(this, key, {
        get: () => {
          return methods[key]
        },
      })
    }
  }

  // 将computed的值代理到数据中
  computedHandle(computed) {
    for (let key in computed) {
      Object.defineProperty(this.$data, key, {
        get: () => {
          return computed[key].call(this)
        },
      })
    }
  }

  // vm上的取值和赋值操作都代理到 vm.$data 方便用户操作
  proxyVm(data) {
    // 不用深层递归 因为直接取到了$data $data自己有做深层代理
    for (let key in data) {
      Object.defineProperty(this, key, {
        get: () => {
          return this.$data[key]
        },
        set: (newValue) => {
          this.$data[key] = newValue
        },
      })
    }
  }
}

// 数据劫持
class Observer {
  constructor(data, vm) {
    this.observer(data)
  }
  observer(data) {
    //  是对象才进入 递归打断
    if (data && typeof data === 'object') {
      for (let key in data) {
        this.defineReactive(data, key, data[key])
      }
    }
  }
  // 数据劫持
  defineReactive(obj, key, value) {
    this.observer(value) // 递归劫持对象中的属性
    let dep = new Dep() // 给每一个属性都加上一个具有发布订阅的功能
    Object.defineProperty(obj, key, {
      get() {
        // 创建watcher时 会取到对应的内容 把这个watcher放到全局上 根据有没有target判断是否在初始化watcher
        Dep.target && dep.addSub(Dep.target) // 给观察者添加watcher
        return value
      },
      set: (newValue) => {
        if (value !== newValue) {
          this.observer(newValue) // 如果新值是对象 就重新劫持
          value = newValue
          dep.notify() // 数据变化 发布更新
        }
      },
    })
  }
}

// TODO: 如何把watcher添加到订阅池Dep中
// 1. 数据劫持的时候 每个数据都会单独拥有一个Dep实例 用于后续的订阅池容器和更新订阅池
//  	let dep = new Dep() // 给每一个属性都加上一个具有发布订阅的功能
// 2.  在编译html模板的时候 如果元素使用了data数据就将数据转化为成value  读取数据过程中会new watcher 
//     // 给输入框加入一个观察者
//     new Watcher(vm, expr, (newVal) => {
//       // 稍后数据更新了 会触发回调 拿到新值 更新输入框
//       fn(node, newVal)
//     })
// 3.  new watcher之后 会设置Deple类的target为当前watcher 然后取一次watcher的data的值 取data的值会转到数据劫持的get回调中
//     Dep.target = this // 把watcher添加到Dep.target上
//     // 取值的时候 判断有target 将它添加到Dep实例化的观察者中
//     let value = CompileUtil.getVal(this.vm, this.expr)

// 4.  在data的数据劫持过程中 如果判断类Dep.target有值 则 将Dep.target 也就是watcher添加到订阅池中

//       get() {
//         // 创建watcher时 会取到对应的内容 把这个watcher放到全局上 根据有没有target判断是否在初始化watcher
//         Dep.target && dep.addSub(Dep.target) // 给观察者添加watcher
//         return value
//       },

// 5. 因为这个过程是同步的 所以将当前Dep.target（watcher）添加到订阅池之后，会回到watcher取data值之后的操作中 将Dep.target重置为null，等待下次new watcher 添加实例

//     Dep.target = null // 添加完watcher即取消 target 等待下一次添加watcher


class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm
    this.expr = expr
    this.cb = cb
    // 默认先存放一个老值
    this.oldVal = this.get()
  }
  // new watcher调用 将watcher添加到属性的Dep中
  get() {
    Dep.target = this // 把watcher添加到Dep.target上
    // 取值的时候 判断有target 将它添加到Dep实例化的观察者中
    let value = CompileUtil.getVal(this.vm, this.expr)
    Dep.target = null // 添加完watcher即取消 target 等待下一次添加watcher
    return value
  }
  // 数据变化后调用观察者的update方法
  update() {
    let newVal = this.get()
    if (newVal !== this.oldVal) {
      this.cb(newVal) // 调用watcher时的回调 更新html模板
    }
  }
}

// 观察者
class Dep {
  constructor() {
    this.subs = [] // 存放所有watcher
  }
  // 订阅 添加watcher
  addSub(watcher) {
    this.subs.push(watcher)
  }
  // 发布
  notify() {
    this.subs.forEach((watcher) => watcher.update())
  }
}

// 负责编译
class Compiler {
  constructor(el, vm) {
    this.vm = vm
    this.el = this.isElementNode(el) ? el : document.querySelector(el)
    let fragment = this.node2fragment(this.el)

    // 把节点中的内容 进行替换

    // 编译模板 用数据编译
    this.compile(fragment)

    // 把内容再塞到页面中
    this.el.appendChild(fragment)
  }
  // 编译内存中的dom节点
  compile(node) {
    let childNodes = node.childNodes

    ;[...childNodes].forEach((child) => {
      if (this.isElementNode(child)) {
        this.compileElement(child)
        // 如果是元素的话 需要递归 把自己传进去 再遍历子节点
        this.compile(child)
      } else {
        this.compileText(child)
      }
    })
  }
  //   是否是指令
  isDirective(attrName) {
    return attrName.startsWith('v-')
  }
  // 编译元素
  compileElement(node) {
    let attributes = node.attributes
    ;[...attributes].forEach((attr) => {
      // type="text" v-model="school.name"
      let { name, value: expr } = attr
      if (this.isDirective(name)) {
        const [, directive] = name.split('-') // v-model v-on:click
        let [directiveName, eventName] = directive.split(':')
        // 调用不同的指令来处理
        CompileUtil[directiveName](node, expr, this.vm, eventName)
      }
    })
  }
  // 编译文本
  compileText(node) {
    //   判断当前文本节点是否包含{{a}} {{b}}
    let content = node.textContent
    if (/\{\{(.+?)\}\}/.test(content)) {
      CompileUtil['text'](node, content, this.vm)
    }
  }

  // 在文档碎片中编译
  node2fragment(node) {
    // 创建一个文档碎片
    let fragment = document.createDocumentFragment()
    let firstChild
    while ((firstChild = node.firstChild)) {
      fragment.appendChild(firstChild)
    }
    return fragment
  }
  // 是不是元素节点
  isElementNode(node) {
    return node.nodeType === 1
  }
}

// 编译的公共函数
var CompileUtil = {
  // 取data中的数据
  getVal(vm, expr) {
    // vm.$data 'school.name'
    const exprArr = expr.split('.')
    return exprArr.reduce((data, current) => {
      return data[current] // 取下一个expr层级
    }, vm.$data)
  },
  // 设置data中的数据
  setValue(vm, expr, value) {
    // vm.$data 'school.name'
    const exprArr = expr.split('.')
    exprArr.reduce((data, current, index, arr) => {
      if (arr.length - 1 === index) {
        data[current] = value
        return
      }
      return data[current]
    }, vm.$data)
  },
  // v-model指令
  model(node, expr, vm) {
    // node是节点 expr是表达式 vm 是vue实例
    let fn = this.updater['modelUpdater']
    // 给输入框加入一个观察者
    new Watcher(vm, expr, (newVal) => {
      // 稍后数据更新了 会触发回调 拿到新值 更新输入框
      fn(node, newVal)
    })
    // 视图更新数据
    node.addEventListener('input', (e) => {
      let newVal = e.target.value
      this.setValue(vm, expr, newVal)
    })
    const value = this.getVal(vm, expr)
    fn(node, value)
  },
  // 重新编译表达式
  getContentValue(vm, expr) {
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getVal(vm, args[1])
    })
  },
  // on方法
  on(node, expr, vm, eventName) {
    // expr = change
    node.addEventListener(eventName, (e) => {
      vm[expr].call(vm, e)
    })
  },
  // 文本字节编译
  text(node, expr, vm) {
    // expr = {{a}} {{b}}
    let fn = this.updater['textUpdater']
    let content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      // 给表达式 每个{{}}加一个观察者
      new Watcher(vm, args[1], (newVal) => {
        const newContent = this.getContentValue(vm, expr) // 重新编译表达式
        fn(node, newContent)
      })
      return this.getVal(vm, args[1])
    })

    fn(node, content)
  },
  html(node, expr, vm) {
    //  expr v-html="message"
    let fn = this.updater['htmlUpdater']
    new Watcher(vm, expr, (newVal) => {
      fn(node, newVal)
    })
    const value = this.getVal(vm, expr)
    fn(node, value)
  },
  updater: {
    // 更新input 的v-model
    modelUpdater(node, value) {
      node.value = value
    },
    textUpdater(node, value) {
      node.textContent = value
    },
    // xss攻击有可能
    htmlUpdater(node, value) {
        node.innerHTML = value
    },
  },
}
