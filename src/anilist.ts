import fetch from 'node-fetch';
import { GraphAPI } from './graphql';

export const redirectUri = 'https://anilist.co/api/v2/oauth/pin';
export const oauthUrl = 'https://anilist.co/api/v2/oauth/authorize';

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

const api = new GraphAPI('https://graphql.anilist.co');

export async function getToken(
    apiClientId: number,
    apiClientSecret: string, 
    authCode: string
): Promise<string | null> {
    const response = await fetch('https://anilist.co/api/v2/oauth/token', {
        method: 'POST',
        timeout: 5000,
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: apiClientId,
            client_secret: apiClientSecret,
            redirect_uri: redirectUri,
            code: authCode
        })
    });
    if (!response.ok) return null;
    return (await response.json()).access_token;
}

export async function testConnection(
    userId: number,
    token: string
): Promise<boolean> {
    try {
        const response = await api.query(
            `query ($userId: Int) {    
                User(id: $userId) {
                    id
                    options {
                        timezone
                    }
                }
            }`,
            { userId: userId },
            token
        );
        return Boolean(response.data.User?.options?.timezone);
    } catch (err) {
        return false;
    }
}

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
    );
    if (response.errors && response.errors.some((e) => e.status == 404)) {
        return null;
    }
    return response.data.User as User;
}

export async function getMediaListPage(
    userId: number,
    type: MediaListType,
    status: MediaListStatus,
    page = 0
): Promise<MediaListPage | null> {
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
    const results = response.data.Page?.mediaList;
    if (!results) return null;
    return {
        entries: results as MediaListItem[],
        type: type,
        status: status,
        pageInfo: response.data.Page.pageInfo as PageInfo
    };
}