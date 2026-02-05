import Foundation

struct User: Codable, Identifiable, Equatable {
    let id: String
    let email: String?
    let name: String?
    let image: String?
    let hasOverleafCredentials: Bool?
    let hasGitHubToken: Bool?
    let hasGitLabToken: Bool?
    let latexCacheMode: LatexCacheMode?
    let latexCacheAllowed: Bool?
    let backgroundRefreshDefault: Bool?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case email, name, image
        case hasOverleafCredentials, hasGitHubToken, hasGitLabToken
        case latexCacheMode
        case latexCacheAllowed
        case backgroundRefreshDefault
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        email = try container.decodeIfPresent(String.self, forKey: .email)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        image = try container.decodeIfPresent(String.self, forKey: .image)
        hasOverleafCredentials = try container.decodeIfPresent(Bool.self, forKey: .hasOverleafCredentials)
        hasGitHubToken = try container.decodeIfPresent(Bool.self, forKey: .hasGitHubToken)
        hasGitLabToken = try container.decodeIfPresent(Bool.self, forKey: .hasGitLabToken)
        latexCacheMode = try container.decodeIfPresent(LatexCacheMode.self, forKey: .latexCacheMode)
        latexCacheAllowed = try container.decodeIfPresent(Bool.self, forKey: .latexCacheAllowed)
        backgroundRefreshDefault = try container.decodeIfPresent(Bool.self, forKey: .backgroundRefreshDefault)
    }
}
