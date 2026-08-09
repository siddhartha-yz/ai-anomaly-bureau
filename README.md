# AI异常调查局：失控的分类器

面向大学 AI 社团零基础大一新生的机器学习入门网页游戏。第一版是一个无后端、无需注册、浏览器本地运行的完整单人垂直切片。

## 本地运行

项目正式使用 Node.js 24 LTS。

```bash
npm install
npm run dev
```

## 验证

```bash
npm run check
npm test -- --run
npm run build
```

## 开发者测试模式

实现完成后可通过 `?debug=1` 开启开发者面板。

产品与技术设计见：
- `docs/PRODUCT_DESIGN.md`
- `docs/TECHNICAL_DESIGN.md`
