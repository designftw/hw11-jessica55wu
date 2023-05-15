import * as Vue from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
import {mixin} from "https://mavue.mavo.io/mavue.js";
import GraffitiPlugin from 'https://graffiti.garden/graffiti-js/plugins/vue/plugin.js'
import Resolver from './resolver.js'
import { recordAudio } from './audioRecorder.js';

const app = {
  // Import MaVue
  mixins: [mixin],

  // Import resolver
  created() {
    this.resolver = new Resolver(this.$gf);
    this.fetchAllUsernames();
  },

  setup() {
    // Initialize the name of the channel we're chatting in
    const channel = Vue.ref('default')

    // And a flag for whether or not we're private-messaging
    const privateMessaging = Vue.ref(true)

    // If we're private messaging use "me" as the channel,
    // otherwise use the channel value
    const $gf = Vue.inject('graffiti')
    const context = Vue.computed(()=> privateMessaging.value? [$gf.me] : [channel.value])

    // Initialize the collection of messages associated with the context
    const { objects: messagesRaw } = $gf.useObjects(context)
    return { channel, privateMessaging, messagesRaw }
  },

  data() {
    // Initialize some more reactive variables
    return {
      messageText: '',
      editID: '',
      editText: '',
      recipient: '',
      usernameInput: "",
      usernameRequestError: null,
      usernameRequestFeedback: null,
      currentUsername: null,
      searchedUsername: '',
      usernameSearchError: '',
      loadingIndicator: false,
      allUsernames: [],
      file: null,
      downloadedImages: {},
      replyContents: {},
      profileFile: null,
      isRecording: false,
      recordedAudio: null,
      recordedAudioUrl: null,
      downloadedAudios: {},
    }
  },

  mounted() {
    this.gf.on('logIn', this.fetchCurrentUsername);
    this.gf.on('logOut', () => {
      this.messages = [];
      this.currentUsername = null;
    });
  },

  computed: {
    messages() {
      let messages = this.messagesRaw
          // Filter the "raw" messages for data
          // that is appropriate for our application
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-note
          .filter(m=>
              // Does the message have a type property?
              m.type         &&
              // Is the value of that property 'Note'?
              m.type=='Note' &&
              // Does the message have a content property?
              m.content      &&
              // Is that property a string?
              typeof m.content=='string')

      // Do some more filtering for private messaging
      if (this.privateMessaging) {
        messages = messages.filter(m=>
            // Is the message private?
            m.bto &&
            // Is the message to exactly one person?
            m.bto.length == 1 &&
            (
                // Is the message to the recipient?
                m.bto[0] == this.recipient ||
                // Or is the message from the recipient?
                m.actor == this.recipient
            ))
      }

      return messages
          // Sort the messages with the
          // most recently created ones first
          .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
          // Only show the 10 most recent ones
          .slice(0,10)
          // Add the 'liked' property to each message
          .map((message) => {
            return {
              ...message,
              liked: message.liked === true,
            };
          });
    },

    audioMessages() {
      return this.messages.filter((message) =>
          message.attachment &&
          typeof message.attachment === 'object' &&
          message.attachment.type === 'Audio' &&
          typeof message.attachment.magnet === 'string'
      );
    },
  },

  watch: {
    privateMessaging: {
      handler() {
        console.log('privateMessaging watcher called!')
      },
      immediate: true,
    },
    'gf.me': {
      handler() {
        this.fetchCurrentUsername();
      },
      immediate: true,
    },
    messages(messages) {
      const newImageMessages = messages.filter(
          (message) =>
              message.attachment &&
              typeof message.attachment === 'object' &&
              message.attachment.type === 'Image' &&
              typeof message.attachment.magnet === 'string'
      );

      newImageMessages.forEach(async (message) => {
        const magnet = message.attachment.magnet;
        if (!this.downloadedImages[magnet]) {
          console.log('New image message:', message);

          try {
            const imageBlob = await this.$gf.media.fetch(magnet);
            const imageUrl = URL.createObjectURL(imageBlob);
            this.downloadedImages[magnet] = imageUrl;
          } catch (error) {
            console.error('Failed to download image:', error);
          }
        }
      });

      const newAudioMessages = messages.filter(
          (message) =>
              message.attachment &&
              typeof message.attachment === 'object' &&
              message.attachment.type === 'Audio' &&
              typeof message.attachment.magnet === 'string'
      );

      newAudioMessages.forEach(async (message) => {
        const magnet = message.attachment.magnet;
        if (!this.downloadedAudios[magnet]) {
          console.log('New audio message:', message);

          try {
            const audioBlob = await this.$gf.media.fetch(magnet);
            const audioUrl = URL.createObjectURL(audioBlob);
            this.downloadedAudios[magnet] = audioUrl;
          } catch (error) {
            console.error('Failed to download audio:', error);
          }
        }
      });
    },
  },

  methods: {
    async sendMessage() {
      if (!this.messageText && !this.file && !this.recordedAudio) return;

      const message = {
        type: 'Note',
        content: this.messageText,
      };

      if (this.file) {
        try {
          const magnetURI = await this.$gf.media.store(this.file);
          message.attachment = {
            type: 'Image',
            magnet: magnetURI,
          };
          message.content = 'attached image'
        } catch (error) {
          console.error('Failed to upload the image:', error);
          return;
        }
      } else if (this.recordedAudio) {
        try {
          const magnetURI = await this.$gf.media.store(this.recordedAudio.audioBlob);
          const audioURL = window.URL.createObjectURL(this.recordedAudio.audioBlob);

          console.log('before audio transcription')
          const audioTranscription = await transcribeAudio(this.recordedAudio.audioBlob)
            .then(response => response.json()) // Extract the JSON data
            .then(result => {
              // Handle the returned JSON data
              console.log('result: ', result);
              return result;
            })
            .catch(error => {
              // Handle any errors
              console.error(error);
            });
          console.log('audio transcription: ', audioTranscription);
          console.log('after audio transcription');

          const audioTranscriptionText = audioTranscription.text;
          console.log(audioTranscriptionText)

          console.log(audioURL)
          console.log("magnetURI")
          console.log(magnetURI);
          message.attachment = {
            type: 'Audio',
            magnet: magnetURI,
            transcript: audioTranscriptionText
          };
          message.content = 'attached audio';
        } catch (error) {
          console.error('Failed to upload the audio:', error);
          window.alert('Failed to upload the audio');
          window.alert(error);
          return;
        }
      }

      if (this.privateMessaging) {
        message.bto = [this.recipient]
        message.context = [this.$gf.me, this.recipient]
      } else {
        message.context = [this.channel]
      }

      this.$gf.post(message)
      this.messageText = '';
      this.file = null;
      this.recordedAudio = null;
      this.recordedAudioUrl = null;
    },

    async toggleRecording() {
      if (this.isRecording) {
        this.isRecording = false;
        this.recordedAudio = await this.recorder.stop();
        this.recordedAudioUrl = this.recordedAudio.audioUrl;
        console.log("audio done");
        console.log(this.recordedAudioUrl);
        this.recorder = null;
      } else {
        this.isRecording = true;
        this.recorder = new recordAudio();
        await this.recorder.initialize();
        this.recorder.start();
      }
    },

    onImageInput(event) {
      this.file = event.target.files[0];
    },

    async replyToMessage(messageID) {

      const replyContent = this.replyContents[messageID];
      if (!replyContent) return;

      const message = {
        type: 'Note',
        content: replyContent,
        inReplyTo: messageID,
      };

      if (this.privateMessaging) {
        message.bto = [this.recipient]
        message.context = [this.$gf.me, this.recipient]
      } else {
        message.context = [this.channel]
      }

      this.$gf.post(message)
    },

    getMessageSnippet(messageID) {
      const originalMessage = this.messages.find((msg) => msg.id === messageID);
      if (originalMessage) {
        return originalMessage.content.slice(0, 30) + '...';
      }
      return '';
    },

    removeMessage(message) {
      this.$gf.remove(message)
    },

    startEditMessage(message) {
      // Mark which message we're editing
      this.editID = message.id
      // And copy over it's existing text
      this.editText = message.content
    },

    saveEditMessage(message) {
      // Save the text (which will automatically
      // sync with the server)
      message.content = this.editText
      // And clear the edit mark
      this.editID = ''
    },

    openPrivateChat(username) {
      // Set the searchedUsername to the username passed in
      this.searchedUsername = username;
      // Call the searchByUsername method to search for messages
      this.searchByUsername();
    },

    async requestUsername() {
      this.usernameRequestError = '';
      this.usernameRequestFeedback = '';
      try {
        await this.resolver.requestUsername(this.usernameInput);
        this.currentUsername = this.usernameInput;
        this.usernameRequestFeedback = 'Username successfully requested!';
      } catch (error) {
        console.error('Error requesting username:', error);
        this.usernameRequestError = 'Failed to request username. Please try again.';
        this.usernameInputTouched = true;
        this.$nextTick(() => {
          const input = document.querySelector('input');
          input.classList.add('error-shake');
          setTimeout(() => {
            input.classList.remove('error-shake');
          }, 500);
        });
      }
    },

    async fetchCurrentUsername() {
      if (this.gf) {
        try {
          this.currentUsername = await this.resolver.actorToUsername(this.gf.me());
        } catch (error) {
          console.error('Error fetching current username:', error);
        }
      }
    },

    async searchByUsername() {
      this.usernameSearchError = '';
      this.loadingIndicator = true;
      try {
        const actorId = await this.resolver.usernameToActor(this.searchedUsername);
        if (actorId) {
          this.recipient = actorId;
        } else {
          this.usernameSearchError = 'Username not found.';
        }
      } catch (error) {
        console.error('Error searching username:', error);
        this.usernameSearchError = 'Failed to search username. Please try again.';
      } finally {
        this.loadingIndicator = false;
      }
    },

    async fetchAllUsernames() {
      try {
        this.allUsernames = await this.resolver.getAllUsernames();
        this.allUsernames = allUsernames.filter(usernameObj => usernameObj.actorId !== this.$gf.me); // line is not quite working, needs fixing
        console.log('HERERERER: ', this.allUsernames)

      } catch (error) {
        console.error('Error fetching all usernames:', error);
      }
    },


  }
}

function transcribeAudio(audioBlob) {
  // Create a FormData object
  const formData = new FormData();

  // Append the audio blob to the FormData object with a key 'audio'
  formData.append('audio', audioBlob, 'audio.wav');

  console.log("Sending data to server")

  // Make a POST request to your Flask server
  // fetch('https://apitestkev--jessicawu15.repl.co/recv', {
  return fetch('https://audio-transcription-api.herokuapp.com/recv', {
    method: 'POST',
    body: formData
  })
      .then(response => {
        if (!response.ok) {
          throw new Error('Request failed with status ' + response.status);
        }
        return response; // return entire response object
      })
      .catch(error => {
        console.error(error);
        throw error;
        });
}

const Name = {
  props: ['actor', 'editable'],

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },

  computed: {
    profile() {
      return this.objects
          // Filter the raw objects for profile data https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
          .filter(m=>
              m.type && // Does the message have a type property?
              m.type=='Profile' && // Is the value of that property 'Profile'?
              m.name && // Does the message have a name property?
              typeof m.name=='string') // Is that property a string?
          // Choose the most recent one or null if none exists
          .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    },
  },

  data() {
    return {
      editing: false,
      editText: '',
    }
  },

  methods: {
    editName() {
      this.editing = true
      // If we already have a profile, initialize the edit text to our existing name
      this.editText = this.profile? this.profile.name : this.editText
    },

    saveName() {
      if (this.profile) {
        // If we already have a profile, just change the name (this will sync automatically)
        this.profile.name = this.editText
      } else { // Otherwise create a profile
        this.$gf.post({
          type: 'Profile',
          name: this.editText
        })
      }
      this.editing = false // Exit the editing state
    }
  },

  template: '#name'
}

const Like = {
  props: ["messageId"],
  template: '#like',

  setup(props) {
    const $gf = Vue.inject('graffiti');
    const messageId = Vue.toRef(props, 'messageId'); // Change this line
    const { objects: likesRaw } = $gf.useObjects([messageId]);
    return { likesRaw };
  },

  computed: {
    likes() {
      return this.likesRaw.filter(
          (like) => like.type === 'Like' && like.object === this.messageId
      );
    },
    myLikes() {
      return this.likes.filter((like) => like.actor === this.$gf.me);
    },
  },

  methods: {
    sendLike() {
      this.$gf.post({
        type: 'Like',
        object: this.messageId,
        context: [this.messageId],
      });
    },

    removeLike() {
      for (const like of this.myLikes) {
        this.$gf.remove(like);
      }
    },
  }
}

const ReadReceipts = {
  props: ["messageid"],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const messageid = Vue.toRef(props, 'messageid')
    return $gf.useObjects([messageid])
  },

  async mounted() {
    if (!(this.readActors.includes(this.$gf.me))) {
      this.$gf.post({
        type: 'Read',
        object: this.messageid,
        context: [this.messageid]
      })
    }
  },

  computed: {
    reads() {
      return this.objects.filter(o=>
          o.type == 'Read' &&
          o.object == this.messageid)
    },

    myReads() {
      return this.reads.filter(r=>r.actor==this.$gf.me)
    },

    readActors() {
      return [...new Set(this.reads.map(r=>r.actor))]
    }
  },

  watch: {
    // In case we accidentally "read" more than once.
    myReads(myReads) {
      if (myReads.length > 1) {
        // Remove all but one
        this.$gf.remove(...myReads.slice(1))
      }
    }
  },

  template: '#read-receipts'
}

const MagnetImg = {
  props: {
    src: String,
    loading: {
      type: String,
      default: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Loading_icon_cropped.gif'
    },
    error: {
      type: String,
      default: 'https://images.nightcafe.studio//assets/profile.png?tr=w-1600,c-at_max' // empty string will trigger broken link
    }
  },

  data() {
    return { fetchedSrc: '' }
  },

  watch: {
    src: {
      async handler(src) {
        this.fetchedSrc = this.loading
        try {
          this.fetchedSrc = await this.$gf.media.fetchURL(src)
        } catch {
          this.fetchedSrc = this.error
        }
      },
      immediate: true
    }
  },

  template: '<img :src="fetchedSrc"/>'
}

const ProfilePicture = {
  props: {
    actor: { type: String },
    editable: { type: Boolean, default: false },
    anonymous: {
      type: String,
      default: 'magnet:?xt=urn:btih:58c03e56171ecbe97f865ae9327c79ab3c1d5f16&dn=Anonymous.svg&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
    }
  },

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },

  computed: {
    profile() {
      return this.objects
          .filter(m=>
              m.type=='Profile' &&
              m.icon &&
              m.icon.type == 'Image' &&
              typeof m.icon.magnet == 'string')
          .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    }
  },

  data() {
    return { file: null }
  },

  methods: {
    onPicture(event) {
      this.file = event.target.files[0]
    },

    async savePicture() {
      if (!this.file) return

      this.$gf.post({
        type: 'Profile',
        icon: {
          type: 'Image',
          magnet: await this.$gf.media.store(this.file)
        }
      })
    },
  },

  template: '#profile-picture'
}

const MyProfilePicture = {
  props: {
    actor: { type: String },
    editable: { type: Boolean, default: false },
    anonymous: {
      type: String,
      default: 'magnet:?xt=urn:btih:58c03e56171ecbe97f865ae9327c79ab3c1d5f16&dn=Anonymous.svg&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
    }
  },

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },

  computed: {
    profile() {
      return this.objects
          .filter(m=>
              m.type=='Profile' &&
              m.icon &&
              m.icon.type == 'Image' &&
              typeof m.icon.magnet == 'string')
          .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    }
  },

  data() {
    return { file: null }
  },

  methods: {
    onPicture(event) {
      this.file = event.target.files[0]
    },

    async savePicture() {
      if (!this.file) return

      this.$gf.post({
        type: 'Profile',
        icon: {
          type: 'Image',
          magnet: await this.$gf.media.store(this.file)
        }
      })
    },
  },

  template: '#my-profile-picture'
}

// code for components, not relevant to audio functionality

Vue.createApp(app)
    .component('name', Name)
    .component('like', Like)
    .component('read-receipts', ReadReceipts)
    .component('magnet-img', MagnetImg)
    .component('profile-picture', ProfilePicture)
    .component('my-profile-picture', MyProfilePicture)
    .use(GraffitiPlugin(Vue))
    .mount('#app')
