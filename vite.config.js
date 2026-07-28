import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
    plugins: [
        monkey({
            entry: "src/main.ts",
            userscript: {
                name: "bilibili 移动端",
                namespace: "https://github.com/jk278/bilibili-mobile",
                description:
                    "Safari打开电脑模式，其它浏览器关闭电脑模式修改网站UA，获取舒适的移动端体验。",
                version: "5.3.0",
                author: "jk278",
                license: "MIT",
                "run-at": "document-start",
                icon: "https://www.bilibili.com/favicon.ico",
                match: ["https://*.bilibili.com/*"],
                exclude: [
                    "https://message.bilibili.com/pages/nav/*",
                    "https://www.bilibili.com/blackboard/comment-detail.html?*",
                ],
                require: ["https://unpkg.com/js-md5@0.9.2/src/md5.js"],
            },
            build: {
                fileName: "bilibili-mobile.js", // 输出文件名
                outDir: "dist", // 输出目录
            },
        }),
    ],
});
