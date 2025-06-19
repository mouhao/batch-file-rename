/**
 * 重命名引擎 - 处理各种重命名逻辑
 * 这是一个静态对象，提供了一系列重命名工具函数。
 */
const RenameEngine = (() => {

    const numMap = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
    };

    /**
     * 解析复杂的中文数字（包含百、千、万）
     */
    const parseComplexChineseNumber = (chineseNum) => {
        let result = 0;
        let tempNum = 0;
        
        for (let i = 0; i < chineseNum.length; i++) {
            const char = chineseNum[i];
            
            if (char in numMap) {
                tempNum = numMap[char];
            } else if (char === '十') {
                if (tempNum === 0) tempNum = 1;
                result += tempNum * 10;
                tempNum = 0;
            } else if (char === '百') {
                if (tempNum === 0) tempNum = 1;
                result += tempNum * 100;
                tempNum = 0;
            } else if (char === '千') {
                if (tempNum === 0) tempNum = 1;
                result += tempNum * 1000;
                tempNum = 0;
            } else if (char === '万') {
                if (tempNum === 0) tempNum = 1;
                result = (result + tempNum) * 10000;
                tempNum = 0;
            }
        }
        
        result += tempNum;
        return result;
    };
    
    /**
     * 中文数字转阿拉伯数字核心算法
     */
    const chineseNumberToArabic = (chineseNum) => {
        // 处理特殊情况：十
        if (chineseNum === '十') {
            return '10';
        }

        // 处理包含"十"的复合数字
        if (chineseNum.includes('十')) {
            if (chineseNum.startsWith('十')) { // 十一、十二等
                if (chineseNum.length === 2 && chineseNum[1] in numMap) {
                    return String(10 + numMap[chineseNum[1]]);
                }
            } else if (chineseNum.endsWith('十')) { // 二十、三十等
                if (chineseNum.length === 2 && chineseNum[0] in numMap) {
                    return String(numMap[chineseNum[0]] * 10);
                }
            } else { // 二十三、五十六等
                const parts = chineseNum.split('十');
                if (parts.length === 2 && parts[0] in numMap && parts[1] in numMap) {
                    return String(numMap[parts[0]] * 10 + numMap[parts[1]]);
                }
            }
        }

        if (chineseNum.includes('百') || chineseNum.includes('千') || chineseNum.includes('万')) {
            return String(parseComplexChineseNumber(chineseNum));
        }

        if (chineseNum in numMap) { // 处理简单的单个数字
            return String(numMap[chineseNum]);
        }

        return chineseNum; // 无法转换则返回原文
    };

    /**
     * 转换文件名中的章节编号（如"第X回"）
     */
    const convertChapterNumbers = (filename) => {
        const pattern = /(第)([零一二三四五六七八九十百千万]+)(回)/g;
        return filename.replace(pattern, (match, prefix, chineseNum, suffix) => {
            const arabicNum = chineseNumberToArabic(chineseNum);
            return `${prefix}${arabicNum}${suffix}`;
        });
    };
    
    /**
     * 转换文件名中所有中文数字
     */
    const convertAllChineseNumbers = (filename) => {
        const pattern = /[零一二三四五六七八九十百千万]+/g;
        return filename.replace(pattern, (match) => {
            const converted = chineseNumberToArabic(match);
            return /^\d+$/.test(converted) ? converted : match;
        });
    };

    // --- Public API ---
    const publicApi = {};

    /**
     * 将文件名中的中文数字转换为阿拉伯数字
     */
    publicApi.convertChineseNumbers = (filename, onlyChapter = false) => {
        if (onlyChapter) {
            return convertChapterNumbers(filename);
        } else {
            return convertAllChineseNumbers(filename);
        }
    };

    /**
     * 在文件名前后添加文本
     */
    publicApi.addText = (filename, text, position = 'prefix') => {
        if (!text || !text.trim()) {
            return filename;
        }

        const lastDotIndex = filename.lastIndexOf('.');
        const hasExt = lastDotIndex !== -1 && lastDotIndex > 0;

        if (position === 'prefix') {
            return `${text}${filename}`;
        } else { // suffix
            if (hasExt) {
                const name = filename.substring(0, lastDotIndex);
                const ext = filename.substring(lastDotIndex);
                return `${name}${text}${ext}`;
            } else {
                return `${filename}${text}`;
            }
        }
    };

    /**
     * 在文件名前后添加数字索引
     */
    publicApi.addIndex = (filename, startNumber, digits, separator, position, currentIndex = 0) => {
        const indexNumber = (startNumber || 1) + (currentIndex || 0);
        const paddedIndex = String(indexNumber).padStart(digits || 3, '0');
        const sep = separator === undefined ? '_' : separator;

        const lastDotIndex = filename.lastIndexOf('.');
        const hasExt = lastDotIndex !== -1 && lastDotIndex > 0;

        if (position === 'prefix') {
            return `${paddedIndex}${sep}${filename}`;
        } else { // suffix
            if (hasExt) {
                const name = filename.substring(0, lastDotIndex);
                const ext = filename.substring(lastDotIndex);
                return `${name}${sep}${paddedIndex}${ext}`;
            } else {
                return `${filename}${sep}${paddedIndex}`;
            }
        }
    };

    /**
     * 替换文件名中的指定文本
     */
    publicApi.replaceText = (filename, textToReplace, replacementText) => {
        if (!textToReplace) {
            return filename;
        }
        // Assuming modern JS environment (ES2021+) for replaceAll
        return filename.replaceAll(textToReplace, replacementText || '');
    };

    /**
     * 生成重命名预览
     */
    publicApi.generatePreview = (files, options) => {
        return files.map((file, index) => {
            let newName = file.name;
            
            switch (options.mode) {
                case 'replace':
                    if (options.replaceMode === 'chinese_numeral') {
                        newName = publicApi.convertChineseNumbers(file.name, options.onlyChapterNumbers);
                    } else { // custom_text
                        newName = publicApi.replaceText(file.name, options.textToReplace, options.replacementText);
                    }
                    break;
                case 'text':
                    newName = publicApi.addText(file.name, options.text, options.position);
                    break;
                case 'index':
                    newName = publicApi.addIndex(file.name, options.start, options.digits, options.separator, options.position, index);
                    break;
            }

            const hasChange = newName !== file.name;
            return {
                originalName: file.name,
                newName: hasChange ? newName : '无需处理',
                hasChange: hasChange
            };
        });
    };

    return publicApi;
})();

// 将引擎暴露给渲染进程和主进程
if (typeof window !== 'undefined') {
    // 渲染进程环境 (浏览器)
    window.RenameEngine = RenameEngine;
    window.renameEngine = RenameEngine; // for compatibility with renderer
}

if (typeof module !== 'undefined' && module.exports) {
    // 主进程环境 (Node.js)
    module.exports = RenameEngine;
} 