import fetch from 'node-fetch';

interface GraphResponse {
    data: any,
    errors?: GraphError[]
}

interface GraphError {
    message: string,
    status: number,
    locations: GraphErrorLocation[]
    validation: {[key: string]: string}
}

interface GraphErrorLocation {
    line: number,
    column: number
}
export class GraphAPI {
    url: string;

    constructor(url: string) {
        this.url = url;
    }

    async query(
        query: string,
        variables: unknown,
        token?: string
    ): Promise<GraphResponse> {
        const response = await fetch(this.url, {
            method: 'POST',
            timeout: 5000,
            headers:  {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        });
        return await response.json() as GraphResponse;
    }
}
