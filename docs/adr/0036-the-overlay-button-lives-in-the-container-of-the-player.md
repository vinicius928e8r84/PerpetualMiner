# The overlay button lives in the container of the player

The button is mounted in the container of the player (`#movie_player` on YouTube, the parent of the video elsewhere), not on the page. In full screen only what is inside the element in full screen is drawn, so a button on the page would disappear exactly when someone watches a video the most.
