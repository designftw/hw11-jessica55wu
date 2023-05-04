import * as Vue from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
import {mixin} from "https://mavue.mavo.io/mavue.js";
import GraffitiPlugin from 'https://graffiti.garden/graffiti-js/plugins/vue/plugin.js'
import Resolver from './resolver.js'

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
              liked: 'liked' in message ? message.liked : false,
            };
          });
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
      // Your code here
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
    },
  },

  methods: {
    async sendMessage() {
      if (!this.messageText && !this.file) return;

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
    },

    onImageInput(event) {
      this.file = event.target.files[0];
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
        // window.alert('Username successfully requested!');
      } catch (error) {
        console.error('Error requesting username:', error);
        this.usernameRequestError = 'Failed to request username. Please try again.';
        // window.alert('Cannot request this username!');
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
        console.log('HERERERER: ', this.allUsernames)
      } catch (error) {
        console.error('Error fetching all usernames:', error);
      }
    },


  }
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
          // Filter the raw objects for profile data
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
          .filter(m=>
              // Does the message have a type property?
              m.type &&
              // Is the value of that property 'Profile'?
              m.type=='Profile' &&
              // Does the message have a name property?
              m.name &&
              // Is that property a string?
              typeof m.name=='string')
          // Choose the most recent one or null if none exists
          .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    },
  },

  data() {
    return {
      editing: false,
      editText: ''
    }
  },

  methods: {
    editName() {
      this.editing = true
      // If we already have a profile,
      // initialize the edit text to our existing name
      this.editText = this.profile? this.profile.name : this.editText
    },

    saveName() {
      if (this.profile) {
        // If we already have a profile, just change the name
        // (this will sync automatically)
        this.profile.name = this.editText
      } else {
        // Otherwise create a profile
        this.$gf.post({
          type: 'Profile',
          name: this.editText
        })
      }

      // Exit the editing state
      this.editing = false
    }
  },

  template: '#name'
}

const Like = {
  props: ["messageid"],

  template: '#like',

  computed: {
    isLiked() {
      const message = this.$root.messages.find((msg) => msg.id === this.messageid);
      return message && message.liked;
    },
  },

  methods: {
    toggleLike() {
      const message = this.$root.messages.find((msg) => msg.id === this.messageid);
      if (message) {
        message.liked = !message.liked;
      }
    },
  },
};

app.components = { Name, Like }
Vue.createApp(app)
    .use(GraffitiPlugin(Vue))
    .mount('#app')
