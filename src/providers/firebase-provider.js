const env = jsonRequire(".env.json");
import { request } from "../services/utilities.js";

class FireStoreProvider {
  #apiKey;
  constructor(credentials) {
    this.#apiKey = credentials.apiKey;
    this.projectId = credentials.projectId;
    this.baseUrl = "https://firestore.googleapis.com/v1/projects";
  }
  #getUrl(query) {
    return `${this.baseUrl}/${this.projectId}/databases/(default)/documents${query}`;
  }
  #getOptions(method, token, data) {
    const options = { method, headers: { Authorization: `Bearer ${token}` } };
    if (data) {
      options.body = data;
      options.headers["Content-Type"] = "application/json";
    }
    return options;
  }
  #getBody(fields) {
    return JSON.stringify({ fields });
  }

  async signin(email, password) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.#apiKey}`;
    const response = await request(url, {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
    });
    return {
      idToken: response.idToken,
      refreshToken: response.refreshToken,
    };
  }
  async refreshToken(refreshToken) {
    const url = `https://securetoken.googleapis.com/v1/token?key=${this.#apiKey}`;
    const response = await request(url, {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    return {
      idToken: response.id_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
    };
  }

  testAuthentication(token) {
    return this.getDoc(token, "bots").then(() => true);
  }

  signOut(token) {}

  getDoc(token, collection, docIdName) {
    let query = `/${collection}/${docIdName}`;
    let method = "GET";
    let data;
    if (!docIdName) {
      query = `:runQuery`;
      method = "POST";
      data = JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }] } });
    }
    return request(this.#getUrl(query), this.#getOptions(method, token, data));
  }

  addDoc(token, collection, docIdName, data) {
    const url = this.#getUrl(`/${collection}?documentId=${docIdName}`);
    return request(url, this.#getOptions("POST", token, this.#getBody(new Doc(data))));
  }

  updateDoc(token, collection, docIdName, data) {
    const url = this.#getUrl(`/${collection}/${docIdName}`);
    return request(url, this.#getOptions("PATCH", token, this.#getBody(new Doc(data))));
  }
  deleteDoc(token, collection, docIdName) {
    return request(this.#getUrl(`/${collection}/${docIdName}`), this.#getOptions("DELETE", token));
  }
}

class Doc {
  constructor(data) {
    const mutableField = (k) => !["updateTime"].includes(k); // "createTime"
    Object.keys(data).forEach((k) => mutableField(k) && (this[k] = this.#getTypedValue(data[k])));
  }
  #getTypedValue(value) {
    if (typeof value == "string") return { stringValue: value };
    if (typeof value == "number") {
      if (Number.isInteger(value)) return { integerValue: value };
      return { doubleValue: value };
    }
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.#getTypedValue(v)),
        },
      };
    }
  }
}

const fireStore = new FireStoreProvider(env.FIRESTORE_CREDENTIALS);
export default fireStore;
