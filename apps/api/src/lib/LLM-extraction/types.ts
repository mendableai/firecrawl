export type ScraperLoadOptions = {
    mode?: 'html' | 'text' | 'markdown' | 'image'
    closeOnFinish?: boolean
}

export type ScraperLoadResult = {
    url: string
    content: string
    mode: ScraperLoadOptions['mode']
}