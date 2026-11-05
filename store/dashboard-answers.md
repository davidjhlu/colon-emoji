# Developer Dashboard answers

Paste these into the Privacy tab. Check them against what the dashboard shows, because the form
can change, and some labels below are from memory.

## Single purpose

Lets users insert emoji into text boxes on websites by typing colon shortcodes such as :smile:, with an autocomplete menu. Users can also add their own images to use the same way.

## Permission justifications

**storage**
Saves the on/off setting, the list of sites where the user turned the extension off, whether the user has agreed on the first-run page, custom emoji the user uploads, and how often each emoji is used so frequent ones rank higher.

**unlimitedStorage**
Custom emoji are images the user uploads and are kept on their device. This stops a larger collection from hitting the default local storage limit.

**activeTab**
Reads the hostname of the current tab when the user opens the toolbar popup, so the popup can show the "on this site" toggle for that site.

**Host permission (content script on all URLs)**
The extension's purpose is typing emoji in text boxes on any website, and users can't predict which sites they'll need it on, so a fixed list of sites wouldn't work. The content script only reads the text just before the cursor in the focused text box, to detect a shortcode. Processing happens on the device. The extension makes no network requests.

## Remote code

No, I am not using remote code. All JavaScript is included in the package.

## Data usage

Tick these, because the extension reads typed text on the device. Google's FAQ says local handling still has to be disclosed:

- [x] Personal communications (typed text can include messages and emails)
- [x] User activity (it reacts to keystrokes in text boxes)
- [x] Website content (it reads text in text boxes)

Leave the other categories unticked.

Certify all three statements:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL

https://gist.github.com/davidjhlu/4e977630a097274899e60b1cf854ad55

This is a public gist copy of `store/privacy-policy.md`. Update both together.

## Notes for the reviewer (if the form offers a test instructions field)

No account is needed. After installing, click "I agree, turn it on" on the page that opens. Then on any website with a text box, type :smile: to see it convert, or :sm to open the menu. To test custom emoji, click the toolbar icon, choose Custom emoji and upload an image.
