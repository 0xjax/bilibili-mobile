export const BILIBILI_API = 'https://api.bilibili.com'

export interface AIConclusion {
  code: number
  bvid: string
  model_result: {
    summary: string
    outline: {
      [key: string]: string | Record<string, string | number>[]
      part_outline: Record<string, string | number>[]
    }[]
  }
}

export const aiData: { [key: string]: AIConclusion } = {}
