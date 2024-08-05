const { request } = require("./utilities");

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

  async testAuthentication(token) {
    return !!(await this.getDoc(token, "data", "state"))?.name;
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
    Object.keys(data).forEach((k) => (this[k] = this.#getTypedValue(data[k])));
  }
  #getTypedValue(value) {
    if (typeof value == "string") return { stringValue: value };
    if (typeof value == "number") {
      if (Number.isInteger(value)) return { integerValue: value };
      return { doubleValue: value };
    }
  }
}

module.exports = new FireStoreProvider(require("../.env.json").FIRESTORE_CREDENTIALS);

// { stringValue: "added" }

// import admin from "firebase-admin";

// if (!admin.apps.length) {
//   admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
// }
// const adminAuth = admin.auth();

// async function verifyToken(token) {
//   if (!token) throw new Error("Unauthorized");
//   const decodedToken = await adminAuth.verifyIdToken(token); //.catch((err) => null);
//   if (!decodedToken) throw new Error("Unauthorized");
//   return decodedToken;
// }
