import { O_NOCTTY } from 'node:constants';
import { GraphAPI } from './graphql';

const api = new GraphAPI('https://graphql.anilist.co');

export interface User {
    id: number,
    name: string,
    options: {
        profileColor: string
    },
    avatar: {
        medium: string
    }
}

export interface MediaList {
    type: MediaListType,
    status: MediaListStatus
    entries: MediaListItem[]
}

export interface MediaListPage extends MediaList {
    pageInfo: PageInfo
}

export interface MediaListItem {
    media: Media,
    progress: number | null;
}

export interface Media {
    id: number,
    title: {
        english: string | null,
        romaji: string | null,
        native: string | null
    },
    chapters: number | null
    episodes: number | null
    isAdult: boolean
}

export interface PageInfo {
    total: number,
    perPage: number,
    currentPage: number,
    lastPage: number,
    hasNextPage: boolean
}

export type MediaListType = 'ANIME' | 'MANGA';

export type MediaListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED'
    | 'PAUSED' | 'REPEATING';

export async function searchUser(
    username: string
): Promise<User | null> {
    if (!username) return null;
    const response = await api.query(
        `query ($username: String) {    
            User(name: $username) {
                id
                name
                options {
                    profileColor
                }
                avatar {
                    medium
                }
            }
        }`,
        {
            username: username
        }
    )
    if (response.errors && response.errors.some((e) => e.status == 404)) {
        return null;
    }
    return response.data.User as User;
}

export async function getMediaListPage(
    userId: number,
    type: MediaListType,
    status: MediaListStatus,
    page: number = 0
): Promise<MediaListPage> {
    const response = await api.query(
        `query (
            $userId: Int,
            $type: MediaType,
            $status: MediaListStatus,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                mediaList (
                    userId: $userId,
                    type: $type,
                    status: $status
                    sort: [UPDATED_TIME_DESC]
                ) {
                    media {
                        id
                        title {
                            english
                            romaji
                            native
                        }
                        episodes
                        chapters
                        isAdult
                    }
                    progress
                }
            }
        }`,
        {
            userId: userId,
            type: type,
            status: status,
            page: page,
            perPage: 6
        }
    );
    const results = response.data.Page.mediaList;
    return {
        entries: results as MediaListItem[],
        type: type,
        status: status,
        pageInfo: response.data.Page.pageInfo as PageInfo
    }
}